import {spawn} from "node:child_process";
import {StringDecoder} from "node:string_decoder";
import {publicCodexEvent} from "./codex-events.mjs";
import {createCodexConnection} from "./codex-connection.mjs";

const instructions="You are the design agent embedded in Design Harness. Follow the supplied design Skill and scope. Do not use tools, delegate, run commands, access the network, or write files. Return only the requested structured proposal. The host validates proposals and writes source files only after user acceptance. Each turn includes the authoritative current source and proposal disposition; earlier proposals in conversation history are not necessarily accepted.";

// One transport multiplexes independent native threads. Native identifiers never
// become workbench session identifiers, and only normalized public activity escapes.
export function createCodexProvider({connection=createCodexConnection(),spawnProcess=spawn,rpcTimeoutMs=30000,cancelTimeoutMs=5000}={}) {
  const pending=new Map(),lateResponses=new Map(),active=new Map(),sessions=new Set();
  let child,starting,closed=false,serial=0;
  function fail(error) {
    for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();lateResponses.clear();
    for(const turn of [...active.values()])turn.finish(error);
    for(const session of sessions)session.unavailable=true;
  }
  function rpc(method,params,onLate) {
    return new Promise((resolve,reject)=>{
      if(!child||closed){reject(new Error("Codex 连接已关闭"));return;}
      const id=++serial,timer=setTimeout(()=>{pending.delete(id);if(onLate)lateResponses.set(id,onLate);reject(new Error("Codex 接口响应超时："+method));},rpcTimeoutMs);
      pending.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({id,method,params})+"\n",error=>{if(error&&pending.delete(id)){clearTimeout(timer);reject(new Error("Codex 连接写入失败"));}});
    });
  }
  function notification(message) {
    if(message.id!==undefined) {
      const request=pending.get(message.id);
      if(request&&!message.method){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message||"Codex 请求失败")):request.resolve(message.result);return;}
      const late=lateResponses.get(message.id);if(late&&!message.method){lateResponses.delete(message.id);if(!message.error)late(message.result);return;}
      // This read-only proposal integration never delegates actions or approvals to the UI.
      if(message.method)child?.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:"This workbench supports read-only structured proposals only"}})+"\n");
      return;
    }
    const turn=active.get(message.params?.threadId);
    if(!turn)return;
    if(!turn.id)turn.buffer.push(message);else turn.receive(message);
  }
  async function start() {
    if(closed)throw new Error("Codex 已关闭");
    if(starting)return starting;
    starting=(async()=>{
      const process=spawnProcess("codex",["app-server","--listen","stdio://","-c","analytics.enabled=false"],{stdio:["pipe","pipe","pipe"]});child=process;
      const decoder=new StringDecoder("utf8");let buffer="";
      process.stdout.on("data",bytes=>{
        buffer+=decoder.write(bytes);
        let end;
        while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.length>16000000){fail(new Error("Codex 返回数据过大"));process.kill();return;}let value;try{value=JSON.parse(line);}catch{continue;}notification(value);}
        if(buffer.length>16000000){fail(new Error("Codex 返回数据过大"));process.kill();}
      });
      process.stderr.resume();process.stdin.on("error",()=>{});
      process.on("error",error=>fail(new Error(error.code==="ENOENT"?"未找到本机 Codex，请先安装并登录":"Codex 进程启动失败")));
      process.on("close",()=>{if(child===process){child=null;starting=null;fail(new Error("Codex 连接已断开，请新建会话后重试"));}});
      try{await rpc("initialize",{clientInfo:{name:"design_harness",title:"Design Harness",version:"0.2.0"}});process.stdin.write(JSON.stringify({method:"initialized",params:{}})+"\n");}
      catch(error){process.kill();throw error;}
    })();
    return starting;
  }
  async function createSession({directory,model}) {
    await start();
    const result=await rpc("thread/start",{cwd:directory,model:model?.id,ephemeral:true,sandbox:"read-only",approvalPolicy:"never",developerInstructions:instructions});
    if(!result?.thread?.id)throw new Error("Codex 未返回原生会话标识");
    const session={threadId:result.thread.id,unavailable:false};sessions.add(session);return session;
  }
  async function runTurn({session,directory,prompt,schema,imageFiles=[],model,signal,onEvent=()=>{}}) {
    if(closed||!sessions.has(session)||session.unavailable)throw new Error("Codex 会话已失效，请新建会话");
    if(signal.aborted)throw new Error("生成已取消");
    if(active.has(session.threadId))throw new Error("当前会话仍在处理上一轮");
    return new Promise((resolve,reject)=>{
      let resultText="",settled=false,cancelTimer;
      const emit=event=>{try{onEvent(event);}catch{/* Display observers must not affect execution. */}};
      const turn={id:null,buffer:[],finish(error,result){
        if(settled)return;settled=true;clearTimeout(cancelTimer);signal.removeEventListener("abort",abort);active.delete(session.threadId);error?reject(error):resolve(result);
      },receive(message){
        const p=message.params??{},id=p.turnId??p.turn?.id;
        if(id!==turn.id)return;
        if(message.method==="item/completed"&&p.item?.type==="agentMessage"&&p.item.phase!=="commentary")resultText=p.item.text;
        const names={agentMessage:"agent_message",commandExecution:"command_execution",mcpToolCall:"mcp_tool_call",fileChange:"file_change",webSearch:"web_search"};
        const event=publicCodexEvent({type:message.method==="turn/completed"&&p.turn.status==="failed"?"turn.failed":message.method==="turn/completed"&&p.turn.status==="interrupted"?"turn.interrupted":message.method.replaceAll("/","."),item:p.item?{...p.item,type:names[p.item.type]??p.item.type}:undefined});
        if(event)emit(event);
        if(message.method==="turn/completed"){
          if(signal.aborted||p.turn.status==="interrupted"){turn.finish(new Error("生成已取消"));return;}
          if(p.turn.status!=="completed"){turn.finish(new Error(p.turn.error?.message||"Codex 生成失败"));return;}
          try{turn.finish(null,JSON.parse(resultText));}catch{turn.finish(new Error("Codex 未返回有效的结构化修改"));}
        }
      }};
      const abort=()=>{
        if(settled)return;
        cancelTimer??=setTimeout(()=>{session.unavailable=true;turn.finish(new Error("取消响应超时，当前会话已停用，请新建会话"));},cancelTimeoutMs);
        if(turn.id)void rpc("turn/interrupt",{threadId:session.threadId,turnId:turn.id}).catch(()=>{});
      };
      active.set(session.threadId,turn);signal.addEventListener("abort",abort,{once:true});
      const interruptStarted=response=>{if(response?.turn?.id)void rpc("turn/interrupt",{threadId:session.threadId,turnId:response.turn.id}).catch(()=>{});};
      void rpc("turn/start",{threadId:session.threadId,cwd:directory,input:[{type:"text",text:prompt},...imageFiles.map(file=>({type:"localImage",path:file}))],model:model.id,effort:model.effort||null,approvalPolicy:"never",sandboxPolicy:{type:"readOnly"},outputSchema:schema},interruptStarted).then(response=>{
        if(settled){if(signal.aborted)interruptStarted(response);return;}
        if(!response?.turn?.id)throw new Error("Codex 未返回轮次标识");
        turn.id=response.turn.id;emit({id:"codex-turn",label:"生成回复或设计修改",status:"running"});
        for(const message of turn.buffer)turn.receive(message);turn.buffer=[];
        if(signal.aborted&&!settled)abort();
      }).catch(error=>{session.unavailable=true;turn.finish(error);});
    });
  }
  async function closeSession(session){if(!sessions.delete(session))return;session.unavailable=true;if(child&&!closed)await rpc("thread/unsubscribe",{threadId:session.threadId}).catch(()=>{});}
  return {id:"codex",capabilities:{images:true,structuredOutput:true,interrupt:true},inspect:options=>connection.read(options),selectModel:(...args)=>connection.select(...args),record:(...args)=>connection.record(...args),createSession,runTurn,closeSession,async dispose(){closed=true;fail(new Error("Agent 已关闭"));child?.stdin.end();child?.kill();await connection.close?.();sessions.clear();}};
}
