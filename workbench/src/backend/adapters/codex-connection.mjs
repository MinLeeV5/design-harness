import {spawn} from "node:child_process";
import os from "node:os";
import {StringDecoder} from "node:string_decoder";

// Read only RPCs. Credentials and arbitrary user configuration never leave this process.
export async function inspectCodex({spawnProcess=spawn,timeoutMs=12000,signal}={}) {
  if(signal?.aborted)throw new Error("Codex 状态读取已取消。");
  const child=spawnProcess("codex",["app-server","--listen","stdio://","-c","analytics.enabled=false"],{cwd:os.tmpdir(),stdio:["pipe","pipe","pipe"]});
  const pending=new Map(),decoder=new StringDecoder("utf8");let serial=0,buffer="",total=0,stopped=false;
  const fail=error=>{for(const item of pending.values())item.reject(error);pending.clear();};
  const abort=()=>{stopped=true;fail(new Error("Codex 状态读取已取消。"));child.kill();};signal?.addEventListener("abort",abort,{once:true});
  child.on("error",error=>fail(new Error(error.code==="ENOENT"?"未找到本机 Codex，请先安装 Codex。":"无法读取本机 Codex 状态。")));
  child.on("close",()=>{stopped=true;fail(new Error("本机 Codex 状态进程已结束。"));});
  child.stdin.on("error",()=>{});child.stderr.resume();
  child.stdout.on("data",bytes=>{
    total+=bytes.length;if(total>4000000){fail(new Error("Codex 状态响应过大。"));child.kill();return;}buffer+=decoder.write(bytes);
    let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const value=JSON.parse(line),item=pending.get(value.id);if(item){pending.delete(value.id);value.error?item.reject(new Error("Codex 状态接口暂不可用。")):item.resolve(value.result);}}catch{/* Ignore non-RPC diagnostics. */}}
  });
  const timer=setTimeout(()=>{fail(new Error("读取 Codex 状态超时，请重试。"));child.kill();},timeoutMs);
  const call=(method,params)=>new Promise((resolve,reject)=>{if(stopped){reject(new Error("本机 Codex 不可用。"));return;}const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+"\n");});
  try {
    await call("initialize",{clientInfo:{name:"design_harness",title:"Design Harness",version:"0.2.0"}});child.stdin.write(JSON.stringify({method:"initialized"})+"\n");
    const [configResult,accountResult,catalogResult]=await Promise.allSettled([call("config/read",{includeLayers:false}),call("account/read",{refreshToken:false}),(async()=>{
      const data=[];let cursor;for(let page=0;page<10;page++){const result=await call("model/list",{limit:100,includeHidden:false,...(cursor?{cursor}:{})});data.push(...result.data);cursor=result.nextCursor;if(!cursor)return data;}throw new Error("模型目录过大。");
    })()]);
    if(configResult.status!=="fulfilled")throw configResult.reason;
    return describeCodex(configResult.value.config,accountResult.status==="fulfilled"?accountResult.value:null,catalogResult.status==="fulfilled"?catalogResult.value:null);
  }finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);child.stdin.end();child.kill();}
}
const short=value=>typeof value==="string"?value.slice(0,160):"";
export function describeCodex(config,account,catalog) {
  const providerId=short(config.model_provider)||"openai",providerName=short(config.model_providers?.[providerId]?.name)||providerId;
  const models=(catalog??[]).filter(model=>!model.hidden&&typeof model.model==="string").map(model=>({id:short(model.model),name:short(model.displayName)||short(model.model),images:!model.inputModalities||model.inputModalities.includes("image"),efforts:(model.supportedReasoningEfforts??[]).map(item=>short(item.reasoningEffort)),defaultEffort:short(model.defaultReasoningEffort),isDefault:!!model.isDefault}));
  const defaultModel=short(config.model)||models.find(model=>model.isDefault)?.id||"",mode=short(account?.account?.type);
  const auth=!account?"unknown":account.requiresOpenaiAuth===false?"external":account.account?"authenticated":"required";
  return {available:true,provider:{id:providerId,name:providerName},auth,authMode:auth==="authenticated"&&["chatgpt","apiKey","amazonBedrock"].includes(mode)?mode:"",defaultModel,defaultEffort:short(config.model_reasoning_effort),models,catalogAvailable:Array.isArray(catalog)};
}
export function createCodexConnection({inspect=inspectCodex,cacheMs=30000}={}) {
  let snapshot,pending,lastRequest,closed=false;const controller=new AbortController();
  async function read({refresh=false}={}) {
    if(closed)throw new Error("Codex 连接已关闭。");
    if(pending)return pending;
    if(!refresh&&snapshot&&Date.now()-snapshot.checkedAt<cacheMs)return {...snapshot,lastRequest};
    pending=(async()=>{try{snapshot={...await inspect({signal:controller.signal}),checkedAt:Date.now()};}catch(error){snapshot={available:false,provider:{id:"",name:"Codex"},auth:"unknown",authMode:"",defaultModel:"",defaultEffort:"",models:[],catalogAvailable:false,checkedAt:Date.now(),error:error.message};}return {...snapshot,lastRequest};})().finally(()=>{pending=null;});return pending;
  }
  async function select(choice="",effortChoice="") {
    if(typeof choice!=="string"||choice.length>160)throw new Error("模型选择无效。");
    const status=await read();if(closed)throw new Error("Codex 连接已关闭。");if(!status.available)throw new Error(status.error||"本机 Codex 不可用。");if(status.auth==="required")throw new Error("请先在本机登录 Codex，再刷新连接状态。");
    const id=choice||status.defaultModel,model=status.models.find(item=>item.id===id);
    if(!id)throw new Error("尚未取得本机默认模型，请刷新后选择模型。");
    if(choice&&!model)throw new Error("所选模型已不在当前目录中，请刷新模型列表后重选。");
    if(model&&!model.images)throw new Error("当前设计对话需要图片输入，请选择支持图片的模型。");
    if(typeof effortChoice!=="string"||effortChoice&&!model?.efforts.includes(effortChoice))throw new Error("当前模型不支持所选思考深度，请重新选择。");
    const automatic=model?(model.efforts.includes(status.defaultEffort)?status.defaultEffort:model.defaultEffort):status.defaultEffort;
    const effort=effortChoice||automatic;
    return {id,name:model?.name||id||"本机默认模型",provider:status.provider.name,providerId:status.provider.id,choice,effort:effort||"",effortChoice};
  }
  function record(model,state){lastRequest={model:model.id,name:model.name,provider:model.provider,state,at:Date.now()};}
  return {read,select,record,async close(){closed=true;controller.abort();await pending;}};
}
