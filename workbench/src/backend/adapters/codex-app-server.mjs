import {spawn} from "node:child_process";
import {StringDecoder} from "node:string_decoder";
import {createCodexActivityStream} from "./codex-events.mjs";
import {createCodexConnection} from "./codex-connection.mjs";
import {validatePermissionMode} from "../../contracts/agent-permissions.mjs";
import {tokenUsage} from "../../contracts/agent-observation.mjs";

const instructions="You are the design agent embedded in Design Harness. Follow the supplied internal identity, execution scope and resource map. Public phase Skills are separate entry points. Read necessary design resources on demand. Use available commands and tools under the native permission policy selected for this turn. Each turn includes authoritative current source, permission mode and proposal disposition; earlier proposals are not necessarily accepted. Prefer editing the current temporary design copy. Return the final structured proposal; public commentary may describe actual progress. Never claim an action that was not performed.";
function permissions(mode,directory){
  validatePermissionMode(mode);
  return {approvalPolicy:mode==="full-access"?"never":"on-request",approvalsReviewer:"user",sandboxPolicy:mode==="full-access"?{type:"dangerFullAccess"}:mode==="read-only"?{type:"readOnly"}:{type:"workspaceWrite",writableRoots:[directory],networkAccess:false,excludeSlashTmp:true,excludeTmpdirEnvVar:true}};
}

// One transport multiplexes independent native threads. Native identifiers never
// become workbench session identifiers, and only normalized public activity escapes.
export function createCodexProvider({connection=createCodexConnection(),spawnProcess=spawn,rpcTimeoutMs=30000,cancelTimeoutMs=5000}={}) {
  const pending=new Map(),lateResponses=new Map(),active=new Map(),sessions=new Set();
  let child,starting,closed=false,serial=0;
  function publishUsage(session,params){
    if(closed||session.unavailable)return;
    const usage=tokenUsage(params.tokenUsage);if(!usage)return;
    const total=usage.total?.totalTokens;
    if(total!==undefined&&session.usageTotal!==undefined&&total<session.usageTotal)return;
    if(total!==undefined)session.usageTotal=total;
    try{session.observe?.({kind:"usage",usage});}catch{/* Observation cannot affect execution. */}
  }
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
      if(message.method){const turn=active.get(message.params?.threadId);if(turn){if(!turn.id)turn.buffer.push(message);else turn.receive(message);}else child?.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:"No active workbench turn for this request"}})+"\n");}
      return;
    }
    const turn=active.get(message.params?.threadId);
    if(!turn){
      if(message.method==="thread/tokenUsage/updated"){
        const p=message.params??{},session=[...sessions].find(s=>s.threadId===p.threadId);
        if(session&&!session.unavailable&&(!p.turnId||p.turnId===session.lastTurnId))publishUsage(session,p);
      }
      return;
    }
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
      try{await rpc("initialize",{clientInfo:{name:"design_harness",title:"Design Harness",version:"0.2.0"},capabilities:{experimentalApi:true}});process.stdin.write(JSON.stringify({method:"initialized",params:{}})+"\n");}
      catch(error){process.kill();throw error;}
    })();
    return starting;
  }
  async function createSession({directory,model,permissionMode="proposal"}) {
    await start();
    const policy=permissions(permissionMode,directory);
    const result=await rpc("thread/start",{cwd:directory,model:model?.id,ephemeral:true,sandbox:permissionMode==="full-access"?"danger-full-access":permissionMode==="read-only"?"read-only":"workspace-write",approvalPolicy:policy.approvalPolicy,approvalsReviewer:policy.approvalsReviewer,developerInstructions:instructions,config:{sandbox_workspace_write:{writable_roots:[directory],exclude_slash_tmp:true,exclude_tmpdir_env_var:true}}});
    if(!result?.thread?.id)throw new Error("Codex 未返回原生会话标识");
    const session={threadId:result.thread.id,unavailable:false};sessions.add(session);return session;
  }
  async function runTurn({session,directory,prompt,schema,imageFiles=[],model,signal,permissionMode="proposal",onEvent=()=>{},onProgress=()=>{},onObservation=()=>{},onApproval=async()=>({decision:"decline"})}) {
    const policy=permissions(permissionMode,directory);
    if(closed||!sessions.has(session)||session.unavailable)throw new Error("Codex 会话已失效，请新建会话");
    if(signal.aborted)throw new Error("生成已取消");
    if(active.has(session.threadId))throw new Error("当前会话仍在处理上一轮");
    session.observe=onObservation;
    return new Promise((resolve,reject)=>{
      let resultText="",settled=false,finishing=false,cancelTimer;
      const approvals=new Map(),nativeItems=new Map();
      const emit=event=>{try{onEvent(event);}catch{/* Display observers must not affect execution. */}};
      const stream=createCodexActivityStream(emit);
      function respond(id,result){if(!child||closed)return;child.stdin.write(JSON.stringify({id,result})+"\n");}
      function clearApproval(id,respondCancelled=true){const pending=approvals.get(id);if(!pending)return;approvals.delete(id);if(respondCancelled)respond(id,pending.method==="item/permissions/requestApproval"?{permissions:{},scope:"turn"}:pending.method==="mcpServer/elicitation/request"?{action:"cancel"}:{decision:"cancel"});pending.controller.abort();}
      function approval(message){
        const p=message.params,method=message.method,known=["item/commandExecution/requestApproval","item/fileChange/requestApproval","item/permissions/requestApproval","mcpServer/elicitation/request"];
        if(!known.includes(method)){child?.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:"Unsupported workbench interaction: "+method}})+"\n");emit({id:"unsupported-"+message.id,label:"当前工具交互暂不受支持",status:"failed",text:method});return;}
        if(approvals.has(message.id))return;
        const item=nativeItems.get(p.itemId),network=p.networkApprovalContext;
        const kind=method==="mcpServer/elicitation/request"?"mcp":network?"network":method.includes("commandExecution")?"command":method.includes("fileChange")?"file":"permissions";
        const request={kind,title:({command:"执行命令需要批准",file:"修改文件需要批准",network:"网络访问需要批准",permissions:"扩展访问权限需要批准"})[kind],reason:typeof p.reason==="string"?p.reason.slice(0,24000):undefined,command:typeof(p.command??item?.command)==="string"?(p.command??item.command).slice(0,24000):undefined,cwd:p.cwd,details:network?JSON.stringify(network):kind==="permissions"?JSON.stringify(p.permissions):p.grantRoot??(item?.changes?.map(change=>change.path).join("\n")),choices:Array.isArray(p.availableDecisions)?p.availableDecisions.filter(value=>["accept","decline","cancel"].includes(value)):["accept","decline","cancel"]};
        if(kind==="mcp"){
          request.title="工具需要确认";request.reason=String(p.message??"").slice(0,24000);request.details=String(p.serverName??"").slice(0,1000);
          if(p.mode==="url"){
            try{const url=new URL(p.url);if(!["http:","https:"].includes(url.protocol))throw new Error();request.url=url.href;}catch{respond(message.id,{action:"decline"});emit({id:"unsupported-"+message.id,label:"工具确认链接无效",status:"failed"});return;}
          }else{
            const schema=p.requestedSchema;
            if(!schema||schema.type!=="object"||!schema.properties||Object.keys(schema.properties).length>32){respond(message.id,{action:"decline"});emit({id:"unsupported-"+message.id,label:"当前工具表单暂不受支持",status:"failed"});return;}
            request.fields=[];
            for(const [id,field]of Object.entries(schema.properties)){
              if(!field||!["string","number","integer","boolean"].includes(field.type)||["__proto__","prototype","constructor"].includes(id)){respond(message.id,{action:"decline"});emit({id:"unsupported-"+message.id,label:"当前工具表单暂不受支持",status:"failed"});return;}
              const options=Array.isArray(field.enum)?field.enum.map((value,index)=>({value,label:field.enumNames?.[index]??value})):Array.isArray(field.oneOf)?field.oneOf.map(option=>({value:option.const,label:option.title??option.const})):undefined;
              if(options?.some(option=>typeof option.value!=="string"||typeof option.label!=="string")){respond(message.id,{action:"decline"});return;}
              request.fields.push({id,label:typeof field.title==="string"?field.title:id,description:field.description,type:field.type,required:schema.required?.includes(id)??false,options,minLength:field.minLength,maxLength:field.maxLength,minimum:field.minimum,maximum:field.maximum});
            }
          }
        }
        const controller=new AbortController();approvals.set(message.id,{method,controller});
        Promise.resolve().then(()=>onApproval(request,{signal:controller.signal})).then(answer=>{
          if(!approvals.has(message.id)||settled)return;
          const decision=request.choices.includes(answer?.decision)?answer.decision:"decline";approvals.delete(message.id);
          respond(message.id,kind==="permissions"?{permissions:decision==="accept"?p.permissions:{},scope:"turn"}:kind==="mcp"?{action:decision,...(decision==="accept"&&request.fields?{content:answer.content??{}}:{})}:{decision});
        }).catch(()=>clearApproval(message.id));
      }
      function complete(error,result){
        if(settled||finishing)return;finishing=true;for(const id of approvals.keys())clearApproval(id);
        void rpc("thread/backgroundTerminals/clean",{threadId:session.threadId}).then(()=>turn.finish(error,result)).catch(()=>{session.unavailable=true;turn.finish(error??new Error("无法清理 Codex 后台终端，当前会话已停用，请新建会话"));});
      }
      const turn={id:null,buffer:[],finish(error,result){
        if(settled)return;settled=true;for(const id of approvals.keys())clearApproval(id);clearTimeout(cancelTimer);signal.removeEventListener("abort",abort);active.delete(session.threadId);error?reject(error):resolve(result);
      },receive(message){
        const p=message.params??{},id=p.turnId??p.turn?.id;
        if(message.method==="thread/tokenUsage/updated"){
          if(id&&id!==turn.id)return;
          publishUsage(session,p);return;
        }
        if(message.method==="serverRequest/resolved"){clearApproval(p.requestId,false);return;}
        if(finishing){
          if(message.id!==undefined){
            if(message.method==="mcpServer/elicitation/request")respond(message.id,{action:"cancel"});
            else if(message.method==="item/permissions/requestApproval")respond(message.id,{permissions:{},scope:"turn"});
            else if(["item/commandExecution/requestApproval","item/fileChange/requestApproval"].includes(message.method))respond(message.id,{decision:"cancel"});
            else child?.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:"The turn has already completed"}})+"\n");
          }return;
        }
        if(id!==turn.id&&!(message.id!==undefined&&message.method==="mcpServer/elicitation/request"&&p.turnId==null)){if(message.id!==undefined)child?.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:"Request does not belong to the active turn"}})+"\n");return;}
        if(message.id!==undefined){approval(message);return;}
        // Progress is payload-free: private/final deltas and output beyond the display cap
        // still keep the active turn alive without exposing their contents to the UI.
        if(["item/agentMessage/delta","item/reasoning/textDelta","item/reasoning/summaryTextDelta","item/commandExecution/outputDelta"].includes(message.method)&&typeof p.delta==="string"&&p.delta.length)try{onProgress();}catch{/* Observation cannot affect execution. */}
        if(message.method==="item/completed"&&p.item?.type==="contextCompaction"&&typeof p.item.id==="string")try{onObservation({kind:"compaction",id:p.item.id,at:Date.now()});}catch{/* Observation cannot affect execution. */}
        if(p.item?.id&&nativeItems.size<256)nativeItems.set(p.item.id,p.item);
        if(message.method==="item/completed"&&p.item?.type==="agentMessage"&&p.item.phase!=="commentary")resultText=p.item.text;
        stream(message);
        if(message.method==="turn/completed"){
          if(signal.aborted||p.turn.status==="interrupted"){complete(new Error("生成已取消"));return;}
          if(p.turn.status!=="completed"){complete(new Error(p.turn.error?.message||"Codex 生成失败"));return;}
          try{complete(null,JSON.parse(resultText));}catch{complete(new Error("Codex 未返回有效的结构化修改"));}
        }
      }};
      const abort=()=>{
        if(settled)return;
        cancelTimer??=setTimeout(()=>{session.unavailable=true;turn.finish(new Error("取消响应超时，当前会话已停用，请新建会话"));},cancelTimeoutMs);
        if(turn.id)void rpc("turn/interrupt",{threadId:session.threadId,turnId:turn.id}).catch(()=>{});
      };
      active.set(session.threadId,turn);signal.addEventListener("abort",abort,{once:true});
      const interruptStarted=response=>{if(response?.turn?.id)void rpc("turn/interrupt",{threadId:session.threadId,turnId:response.turn.id}).then(()=>rpc("thread/backgroundTerminals/clean",{threadId:session.threadId})).catch(()=>{});};
      void rpc("turn/start",{threadId:session.threadId,cwd:directory,input:[{type:"text",text:prompt},...imageFiles.map(file=>({type:"localImage",path:file}))],model:model.id,effort:model.effort||null,summary:"auto",...policy,outputSchema:schema},interruptStarted).then(response=>{
        if(settled){if(signal.aborted)interruptStarted(response);return;}
        if(!response?.turn?.id)throw new Error("Codex 未返回轮次标识");
        turn.id=response.turn.id;session.lastTurnId=turn.id;emit({id:"codex-turn",label:"生成回复或设计修改",status:"running"});
        for(const message of turn.buffer)turn.receive(message);turn.buffer=[];
        if(signal.aborted&&!settled)abort();
      }).catch(error=>{session.unavailable=true;turn.finish(error);});
    });
  }
  async function closeSession(session){if(!sessions.delete(session))return;session.unavailable=true;if(child&&!closed)await rpc("thread/unsubscribe",{threadId:session.threadId}).catch(()=>{});}
  return {id:"codex",capabilities:{images:true,structuredOutput:true,interrupt:true},inspect:options=>connection.read(options),selectModel:(...args)=>connection.select(...args),record:(...args)=>connection.record(...args),createSession,runTurn,closeSession,async dispose(){closed=true;fail(new Error("Agent 已关闭"));child?.stdin.end();child?.kill();await connection.close?.();sessions.clear();}};
}
