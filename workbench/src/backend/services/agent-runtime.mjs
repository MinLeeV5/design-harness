import {randomBytes} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
import {outputSchema} from "../../contracts/agent-output.mjs";
import {tuneProposal} from "../../contracts/agent-controls.mjs";
import {validatePermissionMode} from "../../contracts/agent-permissions.mjs";
import {canonicalDirectory} from "../adapters/filesystem.mjs";
import {loadRequirement} from "../adapters/resource-store.mjs";
import {createAgentProvider} from "./agent-providers.mjs";
import {promptFor} from "../adapters/agent-prompt.mjs";
import {typecheck} from "../adapters/typecheck.mjs";
import {loadAgentSkill} from "../adapters/agent-skills.mjs";
import {hostProjectRoot} from "../adapters/host-project.mjs";
import {prepareAgentContext} from "../adapters/agent-context.mjs";
import {captureDesignView,saveDesignReferences} from "../adapters/design-capture.mjs";
import {copyResources,changesFor,stageValues,createProposalDirectory,removeProposalDirectory,snapshotFiles,snapshotProposalFiles,checkProposalFiles,freezeProposalFiles,stageModelFiles,snapshotTuningFiles,restoreTuningFiles,commitProposalFiles} from "../adapters/proposal-files.mjs";
import {buildRequirement} from "./preview.mjs";
import {validateJob,checkControls} from "./proposals.mjs";
import {checkAgentScope} from "./proposal-policy.mjs";
import {createAgentSettings} from "./agent-settings.mjs";
import {createReviewService} from "./reviews.mjs";
import {explorationSchemaFor,explorationCount,requestsExploration} from "../../contracts/exploration.mjs";
import {createExplorations} from "./explorations.mjs";
const terminal=new Set(["accepted","answered","discarded","cancelled","failed","superseded"]);
const idleTimeoutMessage="Agent 长时间无进展，已超时停止，可重试";
export function createLiveAgentRuntime(workspace,{run,capture=captureDesignView,connection,provider=createAgentProvider({run,connection}),preferences,projectRoot,timeoutMs=600000,previewTimeoutMs=30*60000,reviews=createReviewService(workspace)}={}) {
  workspace=canonicalDirectory(workspace);const jobs=new Map(),sessions=new Map(),defaults=new Map(),starting=new Set(),disposals=new Set(),settings=createAgentSettings(preferences);let closed=false;
  const hostProject=hostProjectRoot(workspace,projectRoot);
  function reviewState(job,state){try{reviews.origin(job.requirement,job.candidate,job.id,state,job.reviewLineageActive?job.reviewAncestors:[]);}catch(error){job.reviewWarning="批阅来源状态未能保存："+error.message;activity(job,"review-source-warning",job.reviewWarning,"failed");}}
  let explorations;
  const cleanup=job=>{const disposal=explorations?.dispose(job);if(disposal){disposals.add(disposal);void disposal.finally(()=>disposals.delete(disposal));}reviewState(job,job.reviewExpired?"expired":job.closedBeforeDecision?"unavailable":terminal.has(job.state)?job.state:"unavailable");clearTimeout(job.timer);if(job.temp){removeProposalDirectory(job.temp);job.temp=null;}};
  const find=id=>{const job=jobs.get(id);assert(job,"生成记录不存在或已过期");return job;};
  function sessionFor(id,candidate,sessionId) {
    assert(!closed,"Agent 已关闭");
    if(sessionId){const session=sessions.get(sessionId);assert(session&&session.requirement===id&&session.candidate===candidate,"会话不存在或不属于当前候选");return session;}
    const key=id+":"+candidate;
    if(!defaults.has(key))defaults.set(key,createSession(id,candidate).id);
    return sessions.get(defaults.get(key));
  }
  function createSession(id,candidate,hidden=false) {
    assert(!closed,"Agent 已关闭");const data=loadRequirement(workspace,id);
    assert(data.manifest.candidates.some(c=>c.id===candidate),"候选不存在");
    const session={id:randomBytes(16).toString("hex"),hidden,providerId:provider.id,requirement:id,candidate,title:"新会话",createdAt:Date.now(),messages:[],native:null,jobId:null,lastRequest:undefined,observation:{compactions:0},compactionIds:new Set()};
    settings.current(session.id);sessions.set(session.id,session);return session;
  }
  const sessionForJob=job=>sessions.get(job.sessionId);
  const message=(job,role,content,state)=>{const item={id:randomBytes(8).toString("hex"),role,identity:job.role,skill:job.skill.skill,model:job.model,permissionMode:job.permissionMode,content,page:job.page,selection:role==="user"?job.selection:null,...(role==="user"&&job.reviewThreads?.length?{reviews:job.reviewThreads}:{}),state,startedAt:Date.now(),...(role==="assistant"?{activity:[],approvals:job.approvals}: {})};sessionForJob(job).messages.push(item);return item;};
  const view=job=>{const result={id:job.id,sessionId:job.sessionId,providerId:provider.id,state:job.state,permissionMode:job.permissionMode,sourceChanged:job.sourceChanged,approvals:job.approvals,startedAt:job.startedAt,page:job.page,role:job.role,skill:job.skill.skill,model:job.model,error:job.error??job.reviewWarning??"",candidate:job.candidate,revision:job.revision,summary:job.summary??"",messages:sessionForJob(job).messages,observation:sessionForJob(job).observation,lastRequest:sessionForJob(job).lastRequest,proposal:job.state==="ready"?job.proposal:undefined};return job.exploration?explorations.decorate(job,result):result;};
  const summary=session=>({id:session.id,providerId:session.providerId,requirement:session.requirement,candidate:session.candidate,title:session.title,createdAt:session.createdAt,state:session.jobId?(find(session.jobId).pendingApprovals.size||explorations?.hasApprovals(find(session.jobId))?"awaiting_approval":find(session.jobId).state):"idle"});
  const snapshot=session=>{const job=session.jobId?view(find(session.jobId)):null;return {...summary(session),messages:job?.messages??session.messages,...settings.current(session.id),job};};
  function record(session,model,state){session.lastRequest={model:model.id,name:model.name,provider:model.provider,state,at:Date.now()};provider.record?.(model,state);}
  function observe(session,event){
    if(event.kind==="usage"){
      const previous=session.observation.usage;session.observation={...session.observation,usage:event.usage};
      return ["last","total"].some(scope=>Object.entries(event.usage?.[scope]??{}).some(([key,value])=>value>(previous?.[scope]?.[key]??0)));
    }
    if(event.kind==="compaction"&&!session.compactionIds.has(event.id)){
      session.compactionIds.add(event.id);session.observation={...session.observation,compactions:session.compactionIds.size,lastCompactionAt:event.at};
      return true;
    }
    return false;
  }
  function ownedJob(id,sessionId){const job=find(id);assert(sessionId?job.sessionId===sessionId:defaults.get(job.requirement+":"+job.candidate)===job.sessionId,"任务不属于当前会话");return job;}
  function refreshIdleTimeout(job){
    if(closed||!job.callActive)return;
    clearTimeout(job.timer);
    if(job.controller.signal.aborted||job.pendingApprovals.size)return;
    job.timer=setTimeout(()=>{
      if(job.callActive&&!job.controller.signal.aborted&&!job.pendingApprovals.size)job.controller.abort("timeout");
    },timeoutMs);job.timer.unref?.();
  }
  function activity(job,id,label,status="running",text,details={}){
    const items=job.reply?.activity;if(!items)return;
    let item=items.find(item=>item.id===id);
    const keys=["kind","command","cwd","output","exitCode","truncated"];
    if(!item||item.label!==label||item.status!==status||(text!==undefined&&item.text!==text)||keys.some(key=>details[key]!==undefined&&item[key]!==details[key]))refreshIdleTimeout(job);
    if(!item){if(items.length>=300)return;item={id,label,status,startedAt:Date.now()};items.push(item);}else {if(item.status!=="running"&&status==="running"){item.startedAt=Date.now();delete item.endedAt;}Object.assign(item,{label,status});}
    if(text!==undefined)item.text=text;
    for(const key of keys)if(details[key]!==undefined)item[key]=details[key];
    if(status!=="running")item.endedAt=Date.now();
  }
  function requestApproval(job,request,{signal}={}){
    if(!job.callActive||job.controller.signal.aborted||signal?.aborted)return Promise.resolve({decision:"cancel"});
    const id=randomBytes(12).toString("hex"),approval={...request,id,state:"pending"};job.approvals.push(approval);
    activity(job,"approval-"+id,approval.title,"running");
    return new Promise(resolve=>{
      const settle=(decision,content)=>{if(!job.pendingApprovals.delete(id))return;signal?.removeEventListener("abort",cancel);job.controller.signal.removeEventListener("abort",cancel);approval.state=decision==="accept"?"accepted":decision==="decline"?"declined":"cancelled";activity(job,"approval-"+id,approval.title,decision==="accept"?"done":"cancelled");refreshIdleTimeout(job);resolve({decision,...(content?{content}:{})});};
      const cancel=()=>settle("cancel");job.pendingApprovals.set(id,settle);clearTimeout(job.timer);signal?.addEventListener("abort",cancel,{once:true});job.controller.signal.addEventListener("abort",cancel,{once:true});
    });
  }
  function clearApprovals(job){for(const settle of job.pendingApprovals.values())settle("cancel");}
  function detectSourceChanges(job){try{job.sourceChanged=loadRequirement(workspace,job.requirement).revision!==job.revision;}catch{job.sourceChanged=true;}}
  function phase(job,id,label){if(closed||(!job.callActive&&job.state!=="accepting"))return;for(const item of job.reply?.activity??[])if(item.status==="running")activity(job,item.id,item.label,"done");activity(job,id,label);}
  const finishMessage=(job,state,content,activityState=state)=>{if(!job.reply)return;job.reply.state=state;if(content!==undefined)job.reply.content=content;job.reply.completedAt??=Date.now();for(const item of job.reply.activity)if(item.status==="running")activity(job,item.id,item.label,activityState==="failed"?"failed":activityState==="cancelled"||activityState==="discarded"?"cancelled":"done");};
  function armPreview(job){clearTimeout(job.timer);if(job.explorationOwner||job.exploration)return;job.timer=setTimeout(()=>{if(job.state==="ready"){job.reviewExpired=true;job.state="discarded";finishMessage(job,"discarded");job.proposal=undefined;activity(job,"expired","预览已过期","done");cleanup(job);}},previewTimeoutMs);job.timer.unref?.();}
  function releaseBase(job){if(job.base){job.base.state="superseded";finishMessage(job.base,"superseded");cleanup(job.base);job.base=null;job.reviewLineageActive=true;}}
  function failOrRecover(job,error,outcome="failed"){
    job.callActive=false;clearApprovals(job);detectSourceChanges(job);const base=job.base;
    if(base?.temp&&!closed){
      cleanup(job);job.temp=base.temp;job.directory=base.directory;base.temp=null;
      job.summary=base.summary;job.page=base.page;job.proposal={...base.proposal,jobId:job.id};job.changes=base.changes;job.controller=new AbortController();job.state="ready";job.error=error+"；上一版预览已保留，可继续调整或接受";
      releaseBase(job);reviewState(job,"ready");finishMessage(job,"ready",job.error,outcome);activity(job,"recovered","上一版预览已恢复","done");armPreview(job);
    }else{job.state="failed";job.error=error;finishMessage(job,"failed",error);releaseBase(job);cleanup(job);}
  }
  async function generate(request,{source:branchSource,branch=false,owner,scope,planningGroup,previous}={}) {
    assert(!closed,"Agent 已关闭");assert(typeof request.prompt==="string"&&request.prompt.trim()&&request.prompt.length<=12000,"请输入内容");
    const session=sessionFor(request.id,request.candidate,request.sessionId);
    assert(!starting.has(session.id),"当前会话正在提交，请稍后重试");starting.add(session.id);
    try {
    const skill=loadAgentSkill(request.role);
    const permissionMode=validatePermissionMode(request.permissionMode??settings.current(session.id).permissionMode);
    const exploring=!branch&&Boolean(planningGroup||request.explore||(!request.baseJob&&requestsExploration(request.prompt)));
    if(exploring)assert(permissionMode==="proposal","多方案探索需要提案工作区权限，请在模型与设置中切换");
    const count=exploring?(request.explore?.count??planningGroup?.count??explorationCount(request.prompt)):1;
    if(exploring)assert(Number.isInteger(count)&&count>=1&&count<=4,"方案数量必须为1到4");
    const requestedPages=exploring?(request.explore?.pages??planningGroup?.pages??[request.page]):null;
    const model=await provider.selectModel(request.model??"",request.effort??"");
    assert(!closed,"Agent 已关闭");
    const acceptedData=loadRequirement(workspace,request.id),data=loadRequirement(branchSource?.directory??workspace,request.id);assert(request.expectedRevision===acceptedData.revision,"设计资源已变化，请刷新后再发送");
    if(branchSource)assert(branchSource.revision===acceptedData.revision,"正式设计已变化，历史方案仍保留；请基于最新设计重新探索或迁移后继续");
    if(exploring)assert(Array.isArray(requestedPages)&&requestedPages.length>0&&new Set(requestedPages).size===requestedPages.length&&requestedPages.every(page=>typeof page==="string"&&page.length<=100),"请选择有效的任务范围");
    assert(data.manifest.candidates.some(c=>c.id===request.candidate)&&data.manifest.pages.some(p=>p.id===request.page),"生成目标不存在");
    assert(request.capture&&request.capture.page===request.page&&request.capture.state&&typeof request.capture.state==="object"&&!Array.isArray(request.capture.state)&&JSON.stringify(request.capture.state).length<=120000,"请从当前页面发送有效的画面与运行状态");
    const reviewContext=reviews.context(request.id,request.candidate,request.reviewIds??[]);
    const selection=request.selection??null;
    if(selection)assert(typeof selection==="object"&&typeof selection.domId==="string"&&typeof selection.target==="string"&&JSON.stringify(selection).length<=32000,"点选目标无效，请重新点选");
    const base=request.baseJob?find(request.baseJob):null;
    if(base)assert(base.sessionId===session.id&&base.state==="ready"&&base.requirement===request.id&&base.candidate===request.candidate&&(base.page===request.page||base.proposal?.pages?.[request.page]||branch&&scope?.includes(request.page))&&base.revision===acceptedData.revision,"只能继续当前方案、页面中尚未接受的预览");
    if(base)assert(base.role===request.role,"切换设计身份前，请先接受或放弃当前提案");
    assert(![...jobs.values()].some(j=>j.sessionId===session.id&&j!==base&&j!==previous&&(j.stopping||!terminal.has(j.state))),"当前会话已有待处理的生成，请先接受、放弃或取消");
    if(selection){const selectedData=base?loadRequirement(base.directory,request.id):data;assert(selectedData.specs[request.candidate+":"+request.page].elements[selection.target.split("/")[0]],"点选目标不在当前预览中，请重新点选");}
    if(base){base.state="refining";clearTimeout(base.timer);try{await stageValues(base,request.values);base.proposal=tuneProposal(base.proposal,request.values??{});base.changes=changesFor(base);}catch(error){base.state="ready";armPreview(base);throw error;}}
    const source=base?loadRequirement(base.directory,request.id):data,sourceWorkspace=base?base.directory:branchSource?.directory??workspace;
    const {temp,directory}=createProposalDirectory();
    const job={id:randomBytes(16).toString("hex"),sessionId:session.id,state:"running",permissionMode,approvals:[],pendingApprovals:new Map(),startedAt:Date.now(),selection,reviewThreads:reviewContext.map(item=>item.thread),requirement:request.id,candidate:request.candidate,page:request.page,role:request.role,skill,model,revision:acceptedData.revision,originalRoot:acceptedData.folder,originalFiles:base?.originalFiles??branchSource?.originalFiles??snapshotFiles(data.folder),temp,directory,controller:new AbortController(),changes:[],base,reviewAncestors:base?[...(base.reviewAncestors??[]),base.id]:[],callActive:true,baseControls:base?.page===request.page?base.proposal.controls??[]:[]};
    job.inheritedRoles=[...new Set([...(branchSource?.inheritedRoles??[]),...(branchSource?.role?[branchSource.role]:[])])];
    job.explorationOwner=owner;job.explorationPages=scope;
    if(exploring){job.exploration={...planningGroup,count:planningGroup?.count??count,planningCount:count,pages:requestedPages,options:planningGroup?.options??[],phase:"planning",expanded:true};job.allPages=data.manifest.pages.map(page=>page.id);job.appendTurn=prompt=>{message(job,"user",prompt,"sent");job.reply=message(job,"assistant","","running");};}
    try{copyResources(sourceWorkspace,source,directory);if(branchSource?.proposal&&request.values)await stageValues({...job,page:branchSource.page,proposal:branchSource.proposal},request.values);job.turnOriginalFiles=branchSource?snapshotFiles(loadRequirement(directory,request.id).folder):undefined;job.stagedFiles=snapshotProposalFiles(directory);assert(loadRequirement(workspace,request.id).revision===acceptedData.revision,"复制设计上下文期间源资源发生变化，请重试");settings.remember(session.id,{identity:request.role,model:model.choice??request.model??"",permissionMode,effort:{model:model.id||request.model||"default",value:model.effortChoice??request.effort??""}});}
    catch(error){cleanup(job);if(base){base.state="ready";armPreview(base);}throw error;}
    const preceding=session.jobId?find(session.jobId):null;
    const disposition={previousProposal:preceding?.state??"none",baseProposal:base?.id??branchSource?.id??null,source:base||branchSource?"pending proposal including tuned controls":"current accepted files",revision:acceptedData.revision};
    if(previous){previous.state="superseded";clearTimeout(previous.timer);}
    session.jobId=job.id;if(!session.messages.length)session.title=request.prompt.trim().slice(0,36);
    jobs.set(job.id,job);message(job,"user",request.prompt,"sent");job.reply=message(job,"assistant","","running");phase(job,"context","准备当前画面与专业设计上下文");
    job.done=(async()=>{
      const signal=job.controller.signal;
      try {
        const currentImage=await capture({capture:request.capture,directory:temp,signal});if(!job.callActive)return;signal.throwIfAborted();
        const imageFiles=saveDesignReferences(request.references,temp),data=loadRequirement(directory,job.requirement);
        const optionContext=await explorations.context(job,request);
        job.optionReferences=request.resolvedOptionReferences;
        const resources=prepareAgentContext({data,request,disposition,identity:skill,temp,currentImage,referenceFiles:imageFiles,hostProject,sourceResources:workspace,sourceRequirement:job.originalRoot,reviewContext,optionContext});
        const {text:normalPrompt,metrics}=promptFor(data,{...request,permissionMode,sourceRoot:job.originalRoot},disposition,skill,imageFiles,resources);
        const prompt=normalPrompt+(exploring?explorations.planningPrompt(job,request):"");
        session.observation={...session.observation,context:metrics};
        phase(job,"request","请求已提交至本机 Codex");
        record(session,model,"running");let result;
        try{
          session.native??=provider.createSession({id:session.id,directory,model,permissionMode}).catch(error=>{session.native=null;throw error;});
          const native=await session.native;if(!job.callActive||signal.aborted){record(session,model,signal.reason==="timeout"?"failed":"cancelled");signal.throwIfAborted();return;}
          result=await provider.runTurn({session:native,sessionId:session.id,directory,prompt,schema:exploring?explorationSchemaFor(count):outputSchema,imageFiles,model,signal,permissionMode,onProgress:()=>refreshIdleTimeout(job),onObservation:event=>{if(!closed&&(job.callActive||event.kind==="usage")&&observe(session,event))refreshIdleTimeout(job);},onApproval:(request,options)=>requestApproval(job,request,options),onEvent:event=>{if(job.callActive&&!signal.aborted)activity(job,event.id,event.label,event.status,event.text,event);}});record(session,model,signal.aborted?signal.reason==="timeout"?"failed":"cancelled":"succeeded");}
        catch(error){record(session,model,signal.aborted&&signal.reason!=="timeout"?"cancelled":"failed");throw error;}if(!job.callActive)return;signal.throwIfAborted();
        assert(result&&typeof result.summary==="string"&&result.summary.trim()&&result.summary.length<=10000&&Array.isArray(result.files)&&result.files.length<=60,"Agent 未返回有效回答或修改");
        clearApprovals(job);detectSourceChanges(job);checkProposalFiles(job,{readOnly:exploring||permissionMode==="read-only"});freezeProposalFiles(job);
        if(exploring){assert(!result.files.length&&!result.controls?.length,"探索讨论轮不能修改文件");job.summary=result.summary;await explorations.planned(job,request,result);return;}
        stageModelFiles(job,result);checkProposalFiles(job);
        if(branch){const changed=loadRequirement(job.directory,job.requirement);if(!changed.manifest.pages.some(page=>page.id===job.page))job.page=changed.manifest.pages[0].id;}
        job.changes=changesFor(job);job.summary=result.summary;checkAgentScope(job);
        if(!job.changes.length){assert(!(result.controls?.length),"纯回答不能提供未生成的调整项");job.callActive=false;job.state="answered";finishMessage(job,"answered",result.summary);releaseBase(job);cleanup(job);return;}
        job.state="validating";phase(job,"types","检查组件与类型");await typecheck(job.directory,{signal});if(!job.callActive)return;signal.throwIfAborted();phase(job,"build","构建隔离预览");const built=await buildRequirement(job.directory,job.requirement);if(!job.callActive)return;signal.throwIfAborted();phase(job,"browser","检查浏览器中的页面与交互");const impact=await validateJob(job,built);if(!job.callActive)return;signal.throwIfAborted();
        const controls=result.files.length===0&&job.baseControls.length?job.baseControls:(result.controls??[]);checkControls(job,built,controls);
        job.proposal=proposalFor(job,built,controls,branch,impact);job.callActive=false;job.state="ready";releaseBase(job);reviewState(job,"ready");finishMessage(job,"ready",result.summary);activity(job,"preview","预览已就绪，等待接受","done");armPreview(job);
      }catch(error){const detail=signal.reason==="timeout"?idleTimeoutMessage:error.message;if(exploring&&!signal.aborted&&explorations.recover(job,detail))clearTimeout(job.timer);else if(job.callActive)failOrRecover(job,detail);}
    })();return view(job);
    } finally {starting.delete(session.id);}
  }
  function proposalFor(job,built,controls=[],branch=true,impact){
    return {jobId:job.id,permissionMode:job.permissionMode,summary:job.summary,html:built.payload.previews[job.candidate],spec:built.data.specs[job.candidate+":"+job.page],pages:branch?Object.fromEntries(built.data.manifest.pages.map(page=>[page.id,{spec:built.data.specs[job.candidate+":"+page.id]}])):undefined,manifest:branch?built.data.manifest:undefined,scenarios:branch?built.data.scenarios:undefined,css:built.data.params[job.candidate].css,controls,changes:job.changes,interactions:built.data.interactions,documentation:built.payload.documentation,reviewHtml:built.html,candidate:job.candidate,page:job.page,impact};
  }
  async function restoreSaved(request,source,{parent=false,owner}={}){
    const session=parent?sessionFor(request.id,request.candidate,request.sessionId):createSession(request.id,request.candidate,true);
    if(parent&&session.jobId){const previous=find(session.jobId);assert(terminal.has(previous.state)||previous.state==="ready","请先停止当前任务");previous.state="superseded";}
    const data=loadRequirement(source.directory,request.id),role=request.role??source.role??settings.current(session.id).identity;
    const job={...source,id:randomBytes(16).toString("hex"),sessionId:session.id,requirement:request.id,candidate:request.candidate,page:data.manifest.pages.some(page=>page.id===source.page)?source.page:data.manifest.pages[0].id,role,skill:loadAgentSkill(role),model:source.model??await provider.selectModel("",""),state:"ready",permissionMode:"proposal",approvals:[],pendingApprovals:new Map(),startedAt:Date.now(),controller:new AbortController(),callActive:false,originalRoot:loadRequirement(workspace,request.id).folder,turnOriginalFiles:snapshotFiles(data.folder),stagedFiles:snapshotProposalFiles(source.directory),explorationOwner:owner};
    try{job.changes=changesFor(job);const built=await buildRequirement(job.directory,request.id);job.proposal=proposalFor(job,built,source.controls??[],true,checkAgentScope(job));jobs.set(job.id,job);session.jobId=job.id;job.reply=message(job,"assistant",parent?"已恢复保存的方案，可比较、继续讨论或再探索。":job.summary??"已恢复方案","ready");job.appendTurn=prompt=>{message(job,"user",prompt,"sent");job.reply=message(job,"assistant","","running");};detectSourceChanges(job);return job;}
    catch(error){removeProposalDirectory(source.temp);throw error;}
  }
  async function accept(id,values,{onValidated}={}) {
    const job=find(id);assert(job.state==="ready","生成结果尚不可接受");assert(loadRequirement(workspace,job.requirement).revision===job.revision,"源资源已被修改，生成结果仍保留；请放弃后基于最新资源重试");
    job.state="accepting";job.acceptAttempts=(job.acceptAttempts??0)+1;job.acceptActivity="accept-"+job.acceptAttempts;phase(job,job.acceptActivity,"校验本次调节与源文件版本");clearTimeout(job.timer);let stagedBefore=new Map();const changesBefore=job.changes;
    try{
    checkProposalFiles(job);
    stagedBefore=snapshotTuningFiles(job);
    if(await stageValues(job,values)){const built=await buildRequirement(job.directory,job.requirement);job.changes=changesFor(job);await validateJob(job,built);}
    checkProposalFiles(job);checkAgentScope(job);
    assert(job.state==="accepting"&&!job.controller.signal.aborted,"接受已中断，未写入设计资源");
    phase(job,"write-"+job.acceptAttempts,"写入当前候选资源");const data=loadRequirement(workspace,job.requirement);assert(data.revision===job.revision,"源资源已被修改，生成结果仍保留；请重新比较");onValidated?.(job);commitProposalFiles(data,job);
    job.state="accepted";finishMessage(job,"accepted");job.proposal=undefined;cleanup(job);return {...view(job),revision:loadRequirement(workspace,job.requirement).revision};
    }catch(error){if(job.state==="accepting"){if(job.temp)restoreTuningFiles(stagedBefore);job.changes=changesBefore;job.state="ready";activity(job,job.acceptActivity,"接受失败，原资源和预览已保留","failed");finishMessage(job,"ready",undefined,"failed");armPreview(job);}throw error;}
  }
  async function event(request) {
    if(request.type==="exploration"&&["open","delete"].includes(request.action)){sessionFor(request.id,request.candidate,request.sessionId);return explorations.handle(null,request);}
    if(["generate","message"].includes(request.type)){const session=sessionFor(request.id,request.candidate,request.sessionId),current=session.jobId?find(session.jobId):null;if(current?.exploration&&!terminal.has(current.state))return explorations.handle(current,request);return generate(request);}
    if(request.job){const job=ownedJob(request.job,request.sessionId);if(job.exploration){const result=await explorations.handle(job,request);if(result)return result;}}
    if(request.type==="approval"){
      assert(typeof request.sessionId==="string"&&request.sessionId,"审批需要所属会话");const job=ownedJob(request.job,request.sessionId),approval=job.approvals.find(item=>item.id===request.approvalId);
      assert(job.callActive&&approval?.state==="pending"&&job.pendingApprovals.has(request.approvalId),"审批已结束或不属于当前任务");assert(approval.choices.includes(request.decision),"审批选项无效");
      if(request.decision==="accept"&&approval.fields){
        const content=request.content??{};assert(content&&typeof content==="object"&&!Array.isArray(content)&&JSON.stringify(content).length<=16000,"工具输入无效");assert(Object.keys(content).every(key=>approval.fields.some(field=>field.id===key)),"工具输入包含未知字段");
        for(const field of approval.fields){const value=content[field.id];assert(value!==undefined||!field.required,"请填写："+field.label);if(value===undefined)continue;
          assert(field.type==="integer"?Number.isInteger(value):typeof value===field.type,"工具输入格式无效："+field.label);if(field.options)assert(field.options.some(option=>option.value===value),"工具输入选项无效："+field.label);
          if(typeof value==="string")assert(value.length>=(field.minLength??0)&&value.length<=(field.maxLength??16000),"工具输入长度无效："+field.label);
          if(typeof value==="number")assert(Number.isFinite(value)&&value>=(field.minimum??-Infinity)&&value<=(field.maximum??Infinity),"工具输入范围无效："+field.label);
        }
      }
      job.pendingApprovals.get(request.approvalId)(request.decision,request.content);return view(job);
    }
    if(request.type==="accept"){ownedJob(request.job,request.sessionId);return accept(request.job,request.values);}
    assert(["discard","cancel"].includes(request.type),"未知的 Agent 事件");const job=ownedJob(request.job,request.sessionId);assert(!terminal.has(job.state),"该生成已经结束");assert(!job.stopping&&!job.controller.signal.aborted,"生成正在停止，请等待当前操作完成");assert(!["accepting","refining"].includes(job.state),"预览正被接受或用于继续生成，请等待当前操作完成");
    job.stopping=true;job.callActive=false;clearTimeout(job.timer);clearApprovals(job);job.controller.abort();
    if(job.base&&request.type==="cancel"){await job.done;failOrRecover(job,"已取消本轮生成","cancelled");job.stopping=false;return view(job);}
    job.state=request.type==="cancel"?"cancelled":"discarded";finishMessage(job,job.state,request.type==="cancel"?"已取消本轮请求":job.reply?.content||"已放弃本轮修改");releaseBase(job);await job.done;detectSourceChanges(job);job.proposal=undefined;cleanup(job);job.stopping=false;return view(job);
  }
  explorations=createExplorations({workspace,find,createSession,generate,event,accept,view,activity,finishMessage,cleanup,restoreSaved,async buildBaseline(job){job.changes=changesFor(job);const built=await buildRequirement(job.directory,job.requirement);return proposalFor(job,built,[],true,checkAgentScope(job));},capture,async closeSession(id){const session=sessions.get(id);if(session?.native){const native=await session.native;await provider.closeSession(native);session.native=null;}}});
  return {
    event,get:(id,sessionId)=>view(ownedJob(id,sessionId)),
    reviewStatus(id,candidate,proposalId){const job=jobs.get(proposalId);if(!job)return "unavailable";assert(job.requirement===id&&job.candidate===candidate,"提案来源不属于当前方案");return job.reviewExpired?"expired":job.closedBeforeDecision?"unavailable":job.state;},
    reviewSource(id,candidate,proposalId){const job=find(proposalId);assert(job.state==="ready"&&job.requirement===id&&job.candidate===candidate,"原提案已结束或不属于当前方案，请回到本地设计新增批阅");return {kind:"proposal",proposalId:job.id,state:"ready",revision:job.revision,pages:loadRequirement(job.directory,job.requirement).manifest.pages.map(p=>p.id)};},
    async connection(options={}){const status=await provider.inspect(options);if(!options.sessionId)return {...status,agentProvider:{id:provider.id,capabilities:provider.capabilities}};const session=sessions.get(options.sessionId);assert(session,"会话不存在");return {...status,lastRequest:session.lastRequest,observation:session.observation,agentProvider:{id:provider.id,capabilities:provider.capabilities}};},
    createSession:(id,candidate)=>snapshot(createSession(id,candidate)),
    sessions(id,candidate){sessionFor(id,candidate);return [...sessions.values()].filter(s=>!s.hidden&&s.requirement===id&&s.candidate===candidate).map(summary);},
    history:(id,candidate)=>explorations.history(id,candidate),
    async saveSettings(id,candidate,patch,sessionId){const session=sessionFor(id,candidate,sessionId),job=session.jobId?find(session.jobId):null;assert(!starting.has(session.id)&&(!job||!job.stopping&&!["running","validating","accepting","refining"].includes(job.state)),"当前会话正在处理，请稍后调整设置");if(job?.state==="ready"&&!job.exploration&&patch.identity)assert(patch.identity===job.role,"请先接受或放弃当前身份的提案");return settings.update(session.id,patch);},
    session(id,candidate,sessionId){return snapshot(sessionFor(id,candidate,sessionId));},
    async close(){closed=true;for(const job of jobs.values()){job.callActive=false;job.controller.abort();if(!terminal.has(job.state)){job.state="cancelled";job.closedBeforeDecision=true;}}await provider.dispose();await Promise.allSettled([...jobs.values()].map(j=>j.done));for(const job of jobs.values())cleanup(job);await Promise.allSettled([...disposals]);jobs.clear();sessions.clear();defaults.clear();settings.clear();}
  };
}
