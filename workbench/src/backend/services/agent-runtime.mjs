import {randomBytes} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
import {outputSchema} from "../../contracts/agent-output.mjs";
import {tuneProposal} from "../../contracts/agent-controls.mjs";
import {canonicalDirectory} from "../adapters/filesystem.mjs";
import {loadRequirement} from "../adapters/resource-store.mjs";
import {createAgentProvider} from "./agent-providers.mjs";
import {promptFor} from "../adapters/agent-prompt.mjs";
import {typecheck} from "../adapters/typecheck.mjs";
import {loadAgentSkill} from "../adapters/agent-skills.mjs";
import {captureDesignView,saveDesignReferences} from "../adapters/design-capture.mjs";
import {copyResources,changesFor,stageValues,createProposalDirectory,removeProposalDirectory,snapshotFiles,stageModelFiles,snapshotTuningFiles,restoreTuningFiles,commitProposalFiles} from "../adapters/proposal-files.mjs";
import {buildRequirement} from "./preview.mjs";
import {validateJob,checkControls} from "./proposals.mjs";
import {checkAgentScope} from "./proposal-policy.mjs";
import {createAgentSettings} from "./agent-settings.mjs";
const terminal=new Set(["accepted","answered","discarded","cancelled","failed","superseded"]);
export function createLiveAgentRuntime(workspace,{run,capture=captureDesignView,connection,provider=createAgentProvider({run,connection}),preferences,timeoutMs=600000}={}) {
  workspace=canonicalDirectory(workspace);const jobs=new Map(),sessions=new Map(),defaults=new Map(),starting=new Set(),settings=createAgentSettings(preferences);let closed=false;
  const cleanup=job=>{clearTimeout(job.timer);if(job.temp){removeProposalDirectory(job.temp);job.temp=null;}};
  const find=id=>{const job=jobs.get(id);assert(job,"生成记录不存在或已过期");return job;};
  function sessionFor(id,candidate,sessionId) {
    assert(!closed,"Agent 已关闭");
    if(sessionId){const session=sessions.get(sessionId);assert(session&&session.requirement===id&&session.candidate===candidate,"会话不存在或不属于当前候选");return session;}
    const key=id+":"+candidate;
    if(!defaults.has(key))defaults.set(key,createSession(id,candidate).id);
    return sessions.get(defaults.get(key));
  }
  function createSession(id,candidate) {
    assert(!closed,"Agent 已关闭");const data=loadRequirement(workspace,id);
    assert(data.manifest.candidates.some(c=>c.id===candidate),"候选不存在");
    const session={id:randomBytes(16).toString("hex"),providerId:provider.id,requirement:id,candidate,title:"新会话",createdAt:Date.now(),messages:[],native:null,jobId:null,lastRequest:undefined};
    settings.current(session.id);sessions.set(session.id,session);return session;
  }
  const sessionForJob=job=>sessions.get(job.sessionId);
  const message=(job,role,content,state)=>{const item={id:randomBytes(8).toString("hex"),role,identity:job.role,skill:job.skill.skill,model:job.model,content,page:job.page,selection:role==="user"?job.selection:null,state,startedAt:Date.now(),...(role==="assistant"?{activity:[]}: {})};sessionForJob(job).messages.push(item);return item;};
  const view=job=>({id:job.id,sessionId:job.sessionId,providerId:provider.id,state:job.state,startedAt:job.startedAt,page:job.page,role:job.role,skill:job.skill.skill,model:job.model,error:job.error??"",candidate:job.candidate,revision:job.revision,summary:job.summary??"",messages:sessionForJob(job).messages,proposal:job.state==="ready"?job.proposal:undefined});
  const summary=session=>({id:session.id,providerId:session.providerId,requirement:session.requirement,candidate:session.candidate,title:session.title,createdAt:session.createdAt,state:session.jobId?find(session.jobId).state:"idle"});
  const snapshot=session=>({...summary(session),messages:session.messages,...settings.current(session.id),job:session.jobId?view(find(session.jobId)):null});
  function record(session,model,state){session.lastRequest={model:model.id,name:model.name,provider:model.provider,state,at:Date.now()};provider.record?.(model,state);}
  function ownedJob(id,sessionId){const job=find(id);assert(sessionId?job.sessionId===sessionId:defaults.get(job.requirement+":"+job.candidate)===job.sessionId,"任务不属于当前会话");return job;}
  function activity(job,id,label,status="running",text){
    const items=job.reply?.activity;if(!items)return;
    let item=items.find(item=>item.id===id);
    if(!item){item={id,label,status,startedAt:Date.now()};items.push(item);}else {if(item.status!=="running"&&status==="running"){item.startedAt=Date.now();delete item.endedAt;}Object.assign(item,{label,status});}
    if(text)item.text=text;
    if(status!=="running")item.endedAt=Date.now();
  }
  function phase(job,id,label){if(closed||(!job.callActive&&job.state!=="accepting"))return;for(const item of job.reply?.activity??[])if(item.status==="running")activity(job,item.id,item.label,"done");activity(job,id,label);}
  const finishMessage=(job,state,content,activityState=state)=>{if(!job.reply)return;job.reply.state=state;if(content!==undefined)job.reply.content=content;job.reply.completedAt??=Date.now();for(const item of job.reply.activity)if(item.status==="running")activity(job,item.id,item.label,activityState==="failed"?"failed":activityState==="cancelled"||activityState==="discarded"?"cancelled":"done");};
  function armPreview(job){clearTimeout(job.timer);job.timer=setTimeout(()=>{if(job.state==="ready"){job.state="discarded";finishMessage(job,"discarded");job.proposal=undefined;activity(job,"expired","预览已过期","done");cleanup(job);}},30*60000);job.timer.unref?.();}
  function releaseBase(job){if(job.base){job.base.state="superseded";finishMessage(job.base,"superseded");cleanup(job.base);job.base=null;}}
  function failOrRecover(job,error,outcome="failed"){
    job.callActive=false;const base=job.base;
    if(base?.temp&&!closed){
      cleanup(job);job.temp=base.temp;job.directory=base.directory;base.temp=null;
      job.summary=base.summary;job.proposal=base.proposal;job.changes=base.changes;job.controller=new AbortController();job.state="ready";job.error=error+"；上一版预览已保留，可继续调整或接受";
      releaseBase(job);finishMessage(job,"ready",job.error,outcome);activity(job,"recovered","上一版预览已恢复","done");armPreview(job);
    }else{job.state="failed";job.error=error;finishMessage(job,"failed",error);releaseBase(job);cleanup(job);}
  }
  async function generate(request) {
    assert(!closed,"Agent 已关闭");assert(typeof request.prompt==="string"&&request.prompt.trim()&&request.prompt.length<=12000,"请输入内容");
    const session=sessionFor(request.id,request.candidate,request.sessionId);
    assert(!starting.has(session.id),"当前会话正在提交，请稍后重试");starting.add(session.id);
    try {
    const skill=loadAgentSkill(request.role);
    const model=await provider.selectModel(request.model??"",request.effort??"");
    assert(!closed,"Agent 已关闭");
    const data=loadRequirement(workspace,request.id);assert(request.expectedRevision===data.revision,"设计资源已变化，请刷新后再发送");
    assert(data.manifest.candidates.some(c=>c.id===request.candidate)&&data.manifest.pages.some(p=>p.id===request.page),"生成目标不存在");
    assert(request.capture&&request.capture.page===request.page&&request.capture.state&&typeof request.capture.state==="object"&&!Array.isArray(request.capture.state)&&JSON.stringify(request.capture.state).length<=120000,"请从当前页面发送有效的画面与运行状态");
    const selection=request.selection??null;
    if(selection)assert(typeof selection==="object"&&typeof selection.domId==="string"&&typeof selection.target==="string"&&JSON.stringify(selection).length<=32000,"点选目标无效，请重新点选");
    const base=request.baseJob?find(request.baseJob):null;
    if(base)assert(base.sessionId===session.id&&base.state==="ready"&&base.requirement===request.id&&base.candidate===request.candidate&&base.page===request.page&&base.revision===data.revision,"只能继续当前方案、页面中尚未接受的预览");
    if(base)assert(base.role===request.role,"切换设计身份前，请先接受或放弃当前提案");
    assert(![...jobs.values()].some(j=>j.sessionId===session.id&&j!==base&&!terminal.has(j.state)),"当前会话已有待处理的生成，请先接受、放弃或取消");
    if(selection){const selectedData=base?loadRequirement(base.directory,request.id):data;assert(selectedData.specs[request.candidate+":"+request.page].elements[selection.target.split("/")[0]],"点选目标不在当前预览中，请重新点选");}
    if(base){base.state="refining";clearTimeout(base.timer);try{await stageValues(base,request.values);base.proposal=tuneProposal(base.proposal,request.values??{});base.changes=changesFor(base);}catch(error){base.state="ready";armPreview(base);throw error;}}
    const source=base?loadRequirement(base.directory,request.id):data,sourceWorkspace=base?base.directory:workspace;
    const {temp,directory}=createProposalDirectory();
    const job={id:randomBytes(16).toString("hex"),sessionId:session.id,state:"running",startedAt:Date.now(),selection,requirement:request.id,candidate:request.candidate,page:request.page,role:request.role,skill,model,revision:data.revision,originalRoot:data.folder,originalFiles:base?.originalFiles??snapshotFiles(data.folder),temp,directory,controller:new AbortController(),changes:[],base,callActive:true,baseControls:base?.proposal.controls??[]};
    try{copyResources(sourceWorkspace,source,directory);assert(loadRequirement(workspace,request.id).revision===data.revision,"复制设计上下文期间源资源发生变化，请重试");settings.remember(session.id,{identity:request.role,model:model.choice??request.model??"",effort:{model:model.id||request.model||"default",value:model.effortChoice??request.effort??""}});}
    catch(error){cleanup(job);if(base){base.state="ready";armPreview(base);}throw error;}
    const previous=session.jobId?find(session.jobId):null;
    const disposition={previousProposal:previous?.state??"none",baseProposal:base?.id??null,source:base?"pending proposal including tuned controls":"current accepted files",revision:data.revision};
    session.jobId=job.id;if(!session.messages.length)session.title=request.prompt.trim().slice(0,36);
    jobs.set(job.id,job);message(job,"user",request.prompt,"sent");job.reply=message(job,"assistant","","running");phase(job,"context","准备当前画面与专业设计上下文");
    job.timer=setTimeout(()=>{if(job.callActive){job.controller.abort("timeout");failOrRecover(job,"Agent 处理超时，可缩小要求后重试");}},timeoutMs);job.timer.unref?.();
    job.done=(async()=>{
      try {
        const currentImage=await capture({capture:request.capture,directory:temp,signal:job.controller.signal});if(!job.callActive)return;
        const imageFiles=[...(currentImage?[currentImage]:[]),...saveDesignReferences(request.references,temp)],prompt=promptFor(loadRequirement(directory,job.requirement),request,disposition,skill,imageFiles);
        phase(job,"request","请求已提交至本机 Codex");
        const signal=job.controller.signal;record(session,model,"running");let result;
        try{
          session.native??=provider.createSession({id:session.id,directory,model}).catch(error=>{session.native=null;throw error;});
          const native=await session.native;if(!job.callActive){record(session,model,signal.reason==="timeout"?"failed":"cancelled");return;}
          result=await provider.runTurn({session:native,sessionId:session.id,directory,prompt,schema:outputSchema,imageFiles,model,signal,onEvent:event=>{if(job.callActive)activity(job,event.id,event.label,event.status,event.text);}});record(session,model,signal.aborted?signal.reason==="timeout"?"failed":"cancelled":"succeeded");}
        catch(error){record(session,model,signal.aborted&&signal.reason!=="timeout"?"cancelled":"failed");throw error;}if(!job.callActive)return;
        assert(result&&typeof result.summary==="string"&&result.summary.trim()&&result.summary.length<=10000&&Array.isArray(result.files)&&result.files.length<=60,"Agent 未返回有效回答或修改");
        stageModelFiles(job,result);
        job.changes=changesFor(job);job.summary=result.summary;checkAgentScope(job);
        if(!job.changes.length){assert(!(result.controls?.length),"纯回答不能提供未生成的调整项");job.callActive=false;job.state="answered";finishMessage(job,"answered",result.summary);releaseBase(job);cleanup(job);return;}
        job.state="validating";phase(job,"types","检查组件与类型");await typecheck(directory,{signal:job.controller.signal});phase(job,"build","构建隔离预览");const built=await buildRequirement(directory,job.requirement);if(!job.callActive||job.controller.signal.aborted)return;phase(job,"browser","检查浏览器中的页面与交互");const impact=await validateJob(job,built);if(!job.callActive)return;
        const controls=result.files.length===0&&job.baseControls.length?job.baseControls:(result.controls??[]);checkControls(job,built,controls);
        const key=job.candidate+":"+job.page;job.proposal={summary:result.summary,html:built.payload.previews[job.page+":"+job.candidate],spec:built.data.specs[key],css:built.data.params[job.candidate].css,controls,changes:job.changes,interactions:built.data.interactions,documentation:built.payload.documentation,reviewHtml:built.html,candidate:job.candidate,page:job.page,impact};job.callActive=false;job.state="ready";releaseBase(job);finishMessage(job,"ready",result.summary);activity(job,"preview","预览已就绪，等待接受","done");armPreview(job);
      }catch(error){if(job.callActive)failOrRecover(job,error.message);}
    })();return view(job);
    } finally {starting.delete(session.id);}
  }
  async function accept(id,values) {
    const job=find(id);assert(job.state==="ready","生成结果尚不可接受");assert(loadRequirement(workspace,job.requirement).revision===job.revision,"源资源已被修改，生成结果仍保留；请放弃后基于最新资源重试");
    job.state="accepting";job.acceptAttempts=(job.acceptAttempts??0)+1;job.acceptActivity="accept-"+job.acceptAttempts;phase(job,job.acceptActivity,"校验本次调节与源文件版本");clearTimeout(job.timer);let stagedBefore=new Map();const changesBefore=job.changes;
    try{
    stagedBefore=snapshotTuningFiles(job);
    if(await stageValues(job,values)){const built=await buildRequirement(job.directory,job.requirement);job.changes=changesFor(job);await validateJob(job,built);}
    assert(job.state==="accepting"&&!job.controller.signal.aborted,"接受已中断，未写入设计资源");
    phase(job,"write-"+job.acceptAttempts,"写入当前候选资源");const data=loadRequirement(workspace,job.requirement);assert(data.revision===job.revision,"源资源已被修改，生成结果仍保留；请重新比较");commitProposalFiles(data,job);
    job.state="accepted";finishMessage(job,"accepted");job.proposal=undefined;cleanup(job);return {...view(job),revision:loadRequirement(workspace,job.requirement).revision};
    }catch(error){if(job.state==="accepting"){if(job.temp)restoreTuningFiles(stagedBefore);job.changes=changesBefore;job.state="ready";activity(job,job.acceptActivity,"接受失败，原资源和预览已保留","failed");finishMessage(job,"ready",undefined,"failed");armPreview(job);}throw error;}
  }
  async function event(request) {
    if(["generate","message"].includes(request.type))return generate(request);
    if(request.type==="accept"){ownedJob(request.job,request.sessionId);return accept(request.job,request.values);}
    assert(["discard","cancel"].includes(request.type),"未知的 Agent 事件");const job=ownedJob(request.job,request.sessionId);assert(!terminal.has(job.state),"该生成已经结束");assert(!["accepting","refining"].includes(job.state),"预览正被接受或用于继续生成，请等待当前操作完成");
    if(job.base&&request.type==="cancel"){job.controller.abort();failOrRecover(job,"已取消本轮生成","cancelled");await job.done;return view(job);}
    job.callActive=false;job.state=request.type==="cancel"?"cancelled":"discarded";finishMessage(job,job.state,request.type==="cancel"?"已取消本轮请求":job.reply?.content||"已放弃本轮修改");job.controller.abort();releaseBase(job);await job.done;job.proposal=undefined;cleanup(job);return view(job);
  }
  return {
    event,get:(id,sessionId)=>view(ownedJob(id,sessionId)),
    async connection(options={}){const status=await provider.inspect(options);if(!options.sessionId)return {...status,agentProvider:{id:provider.id,capabilities:provider.capabilities}};const session=sessions.get(options.sessionId);assert(session,"会话不存在");return {...status,lastRequest:session.lastRequest,agentProvider:{id:provider.id,capabilities:provider.capabilities}};},
    createSession:(id,candidate)=>snapshot(createSession(id,candidate)),
    sessions(id,candidate){sessionFor(id,candidate);return [...sessions.values()].filter(s=>s.requirement===id&&s.candidate===candidate).map(summary);},
    async saveSettings(id,candidate,patch,sessionId){const session=sessionFor(id,candidate,sessionId),job=session.jobId?find(session.jobId):null;assert(!starting.has(session.id)&&(!job||!["running","validating","accepting","refining"].includes(job.state)),"当前会话正在处理，请稍后调整设置");if(job?.state==="ready"&&patch.identity)assert(patch.identity===job.role,"请先接受或放弃当前身份的提案");return settings.update(session.id,patch);},
    session(id,candidate,sessionId){return snapshot(sessionFor(id,candidate,sessionId));},
    async close(){closed=true;for(const job of jobs.values()){job.callActive=false;job.controller.abort();if(!terminal.has(job.state))job.state="cancelled";}await provider.dispose();await Promise.allSettled([...jobs.values()].map(j=>j.done));for(const job of jobs.values())cleanup(job);jobs.clear();sessions.clear();defaults.clear();settings.clear();}
  };
}
