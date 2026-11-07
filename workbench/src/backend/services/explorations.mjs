import path from "node:path";
import {randomBytes} from "node:crypto";
import {assert,safeId} from "../../contracts/assertions.mjs";
import {designText} from "../../contracts/agent-policy.mjs";
import {createExplorationFiles} from "../adapters/exploration-files.mjs";
import {loadRequirement} from "../adapters/resource-store.mjs";
import {copyResources,createProposalDirectory,removeProposalDirectory} from "../adapters/proposal-files.mjs";

const ended=new Set(["accepted","answered","discarded","cancelled","failed","superseded"]);
const latest=option=>option?.versions?.at(-1);
const referenceKey=reference=>[reference.group,reference.option,reference.version].join(":");
function comparisonProposal(proposal){if(!proposal)return undefined;const {reviewHtml,...preview}=proposal;return preview;}
function cleanGroup(group){return {...group,baseJobId:undefined,options:group.options.map(({jobId,sessionId,loadedVersion,...option})=>option)};}

// The workbench owns durable alternatives, confirmation and scheduling.
// Native threads remain ordinary isolated workers.
export function createExplorations({workspace,find,createSession,generate,event,accept,view,activity,finishMessage,cleanup,restoreSaved,buildBaseline,capture,closeSession}){
  const files=createExplorationFiles(workspace),cached=new Map(),loaded=new Set(),operations=new Set();
  const optionJob=option=>option?.jobId?find(option.jobId):null;
  const active=job=>job.exploration.options.find(option=>option.id===(job.exploration.selected??job.exploration.focused));
  const approvals=job=>job.exploration.options.flatMap(option=>optionJob(option)?.approvals??[]);
  const branchActivity=job=>job.exploration.options.flatMap(option=>(optionJob(option)?.reply?.activity??[]).map(item=>({...item,id:option.id+":"+option.jobId+":"+item.id,label:option.label+" · "+item.label})));
  function archiveMessage(job){if(job.reply){job.reply.approvals=[...job.approvals,...approvals(job)];job.reply.activity=[...job.reply.activity,...branchActivity(job)];}}
  function persist(job){if(job.historyDeleted||!job.exploration.id||!job.exploration.snapshot)return;loaded.add(job);const group=cleanGroup(job.exploration);files.mutate(job.requirement,job.candidate,undefined,groups=>{const index=groups.findIndex(item=>item.id===group.id);if(index<0)groups.push(group);else groups[index]=group;});}
  function publicGroup(group){return {...group,snapshot:undefined,originalSnapshot:undefined,options:group.options.map(option=>({...option,jobId:undefined,sessionId:undefined,versions:(option.versions??[]).map(({snapshot,originalSnapshot,...version})=>version)}))};}
  function history(id,candidate){const state=files.read(id,candidate);return {version:state.version,groups:state.groups.map(publicGroup)};}
  function stored(id,candidate,reference){
    assert(reference&&typeof reference.group==="string"&&typeof reference.option==="string","方案引用无效");
    const group=files.read(id,candidate).groups.find(item=>item.id===reference.group),option=group?.options.find(item=>item.id===reference.option),version=option?.versions?.find(item=>item.id===reference.version)??(!reference.version?latest(option):null);
    assert(group&&option&&version,"所引用的方案版本不存在或已删除");return {group,option,version};
  }
  function materialize(id,candidate,group,version){
    const data=loadRequirement(workspace,id),source=createProposalDirectory();
    try{copyResources(workspace,data,source.directory);files.restore(id,candidate,version.snapshot??group.snapshot,path.join(source.directory,"requirements",id));return {...source,revision:version.revision??group.revision,page:version.page??group.page,role:version.role??group.role,model:version.model,summary:version.summary??group.summary,controls:version.controls??[],inheritedRoles:version.inheritedRoles??group.inheritedRoles??[],originalFiles:new Map([...files.contents(id,candidate,version.originalSnapshot??group.originalSnapshot)].filter(([name])=>designText.test(name)).map(([name,bytes])=>[name,bytes.toString("utf8")]))};}
    catch(error){removeProposalDirectory(source.temp);throw error;}
  }
  async function sourceFor(job,option,versionId){
    const version=option.versions.find(item=>item.id===(versionId??option.loadedVersion))??(!versionId?latest(option):undefined);assert(version,"方案尚未生成可继续的版本");
    if(option.loadedVersion===version.id&&optionJob(option)?.temp&&optionJob(option).state==="ready")return optionJob(option);
    const key=referenceKey({group:job.exploration.id,option:option.id,version:version.id});let child=cached.get(key);
    if(!child?.temp||child.state!=="ready")child=await restoreSaved({id:job.requirement,candidate:job.candidate,role:version.role},materialize(job.requirement,job.candidate,job.exploration,version),{owner:job.id});
    cached.set(key,child);option.jobId=child.id;option.sessionId=child.sessionId;option.loadedVersion=version.id;return child;
  }
  function decorate(job,result){
    if(ended.has(job.state))return result;
    const group=job.exploration,option=active(job),child=optionJob(option),allApprovals=[...job.approvals,...approvals(job)];
    const messages=result.messages.map(message=>message.id===job.reply?.id?{...message,approvals:allApprovals,activity:[...message.activity,...branchActivity(job)]}:message);
    return {...result,messages,approvals:allApprovals,proposal:job.state==="ready"&&child?.state==="ready"?child.proposal:undefined,exploration:{...publicGroup(group),baseProposal:group.baseJobId?comparisonProposal(find(group.baseJobId).proposal):undefined,options:group.options.map(option=>{const current=optionJob(option);return {...publicGroup({...group,options:[option]}).options[0],state:current?.state==="ready"?"ready":option.state,error:option.error??current?.error,version:option.loadedVersion??latest(option)?.id,proposal:current?.state==="ready"?comparisonProposal(current.proposal):undefined};})}};
  }
  function ready(job,summary=job.summary){job.callActive=false;job.state="ready";job.exploration.phase="comparing";job.summary=summary;finishMessage(job,"ready",summary);persist(job);}
  function planningPrompt(job,request={}){
    const group=job.exploration,feedback=group.mode==="feedback";
    const task=feedback?"这是方案比较后的反馈。直接文字和局部引用都有效，结合方案资料理解用户意图。纯讨论用 operation=discuss；明确要求细化用 refine，跨方案取舍用 fuse。明确且无关键冲突时 ready=true，可启动一次修改；有关键歧义则 ready=false，在 summary 中只问最高价值的一项。base 使用下方某个方案的 id，directions 提供一个 title/brief，写清保留与修改内容。":"这是新一轮方案探索讨论，目标数量为 "+group.count+"。围绕同一任务提出实质不同的方向。信息不足时 ready=false，在 summary 中逐项讨论。方向和范围足够明确时 operation=explore、ready=true，并提供恰好 "+group.count+" 个 title/brief；用户还会通过工作台确认按钮才启动生成。";
    return "\n本轮由主 Agent 与用户讨论设计，不得修改任何文件，files、controls 必须为空。当前身份："+job.role+"。"+task+"\n任务范围 pages 可包含现有受影响页面及交互任务需要的新页面，不为形式扩展整个需求。各方向遵守共同目标及已确认保留约束，可采用不同页面和流程。当前范围："+JSON.stringify(group.pages)+"。方案列表："+JSON.stringify(group.options.map(option=>({id:option.id,label:option.label,title:option.title,brief:option.brief,version:request.optionSources?.[option.id]??option.loadedVersion??latest(option)?.id})))+"。已有设计结论："+JSON.stringify(group.conclusions??"")+"。返回 summary、files、controls、ready、operation、base、pages、directions。";
  }
  async function planned(job,request,result){
    const group=job.exploration,feedback=group.mode==="feedback";
    assert(typeof result.ready==="boolean"&&["discuss","explore","refine","fuse"].includes(result.operation)&&typeof result.base==="string"&&Array.isArray(result.directions)&&result.directions.length<=(group.planningCount??group.count),"Agent 未返回有效的设计讨论结果");
    assert(result.directions.every(direction=>typeof direction.title==="string"&&direction.title.trim()&&direction.title.length<=80&&typeof direction.brief==="string"&&direction.brief.trim()&&direction.brief.length<=4000)&&new Set(result.directions.map(direction=>direction.title.trim())).size===result.directions.length,"方案方向需要有效且明确区分");
    const pages=result.pages?.length?result.pages:group.pages;assert(Array.isArray(pages)&&pages.length<=100&&pages.every(safeId)&&new Set(pages).size===pages.length,"讨论中的任务范围无效");
    if(!feedback&&result.ready)assert(result.operation==="explore"&&result.directions.length===group.count,"请完成与所选数量一致的方案方向");
    group.id??=job.id;group.createdAt??=Date.now();group.page=job.page;group.role=job.role;group.revision=job.revision;group.pages=pages;group.summary=result.summary;group.planVersion=(group.planVersion??0)+1;
    if(!feedback){group.snapshot=files.saveSnapshot(job.requirement,job.candidate,loadRequirement(job.directory,job.requirement).folder);group.baseJobId=job.id;group.inheritedRoles=[...new Set([...(job.inheritedRoles??[]),job.role])];if(group.parent)job.proposal=await buildBaseline(job);}
    group.originalSnapshot??=files.saveSnapshot(job.requirement,job.candidate,loadRequirement(workspace,job.requirement).folder);
    group.conclusions=result.summary;group.discussion??=[];group.discussion.push({role:"user",identity:job.role,content:request.prompt,at:Date.now(),references:job.optionReferences??[]},{role:"assistant",identity:job.role,content:result.summary,at:Date.now()});group.plan={ready:result.ready,operation:result.operation,base:result.base,directions:result.directions,pages};group.phase="discussing";
    job.explorationRequest={...request,explore:undefined,permissionMode:"proposal"};job.callActive=false;
    if(feedback&&result.ready&&["refine","fuse"].includes(result.operation)){
      job.state="running";group.phase=result.operation==="fuse"?"fusing":"refining";persist(job);
      await modify(job,request,result.operation,result.base,result.directions[0]?.brief??result.summary);
    }else{job.state="ready";finishMessage(job,"ready",result.summary);persist(job);}
  }
  function scopePrompt(job,option,brief){return "\n\n这是"+(job.role==="interaction"?"交互":"视觉")+"方案探索中的独立方案 "+option.label+"："+option.title+"\n方向："+brief+"\n共同任务范围："+JSON.stringify(job.exploration.pages)+"。已确认设计结论："+(job.exploration.conclusions??"")+"。从提供的同一基线完成真实 Spec/React/CSS 及当前身份允许的修改，必须产生可运行预览，不能只返回文字。保留约定内容，引用方案资料只读。只修改本任务涉及的现有页面，交互任务可以登记不同的新页面和流程，并同步必要场景与交互说明。不得修改公共 foundation。";}
  async function runOption(job,option,{source,brief=option.brief,request=job.explorationRequest,refine=false}={}){
    if(job.controller.signal.aborted)return;
    const group=job.exploration,previous=optionJob(option);option.error=undefined;option.state="running";persist(job);
    try{
      let baseline=source;
      if(!baseline){const key=group.id+":base";baseline=group.baseJobId?find(group.baseJobId):cached.get(key);if(!baseline?.temp){baseline=await restoreSaved({id:job.requirement,candidate:job.candidate},materialize(job.requirement,job.candidate,group,{snapshot:group.snapshot}),{owner:job.id});cached.set(key,baseline);}}
      job.controller.signal.throwIfAborted();const session=createSession(job.requirement,job.candidate,true);option.sessionId=session.id;
      const data=loadRequirement(baseline.directory,job.requirement),page=data.manifest.pages.some(item=>item.id===request.page)?request.page:data.manifest.pages[0].id;
      const result=await generate({...request,sessionId:session.id,role:job.role,permissionMode:"proposal",optionReferences:request.resolvedOptionReferences??request.optionReferences,explore:undefined,baseJob:undefined,values:refine?request.values:undefined,page,capture:{...request.capture,page},prompt:request.prompt+scopePrompt(job,option,brief)},{source:baseline,branch:true,owner:job.id,scope:group.pages});
      option.jobId=result.id;if(job.controller.signal.aborted&&!ended.has(result.state))await event({type:"cancel",job:result.id,sessionId:session.id});
      await find(result.id).done;const child=find(result.id);assert(child?.state==="ready"&&!child.error,child?.error??"此方向未生成可运行修改，请重试");option.jobId=child.id;option.sessionId=child.sessionId;
      const version={id:randomBytes(16).toString("hex"),number:(option.versions?.length??0)+1,createdAt:Date.now(),snapshot:files.saveSnapshot(job.requirement,job.candidate,loadRequirement(child.directory,job.requirement).folder),originalSnapshot:group.originalSnapshot,revision:child.revision,role:child.role,model:child.model,page:child.page,controls:child.proposal.controls??[],summary:child.summary,inheritedRoles:[...new Set([...child.inheritedRoles,child.role])],references:child.optionReferences??[]};
      option.versions??=[];option.versions.push(version);option.loadedVersion=version.id;option.state="ready";cached.set(referenceKey({group:group.id,option:option.id,version:version.id}),child);
    }catch(error){option.error=error.message;option.state="failed";if(latest(option)&&previous?.temp){option.jobId=previous.id;option.sessionId=previous.sessionId;option.state="ready";option.error+="；上一版方案已保留";}}finally{persist(job);}
  }
  async function batch(job){
    const group=job.exploration;job.state="running";group.phase="generating";persist(job);activity(job,"exploration","并行生成与验证 "+group.count+" 个可运行方案","running");
    await Promise.all(group.options.map(option=>runOption(job,option)));
    if(!job.controller.signal.aborted){activity(job,"exploration","方案已处理，可以比较已就绪结果","done");group.focused??=group.options.find(option=>option.state==="ready")?.id;ready(job,group.options.filter(option=>option.state==="ready").length+" 个方案已就绪，可比较、引用或继续讨论。");}
  }
  async function modify(job,request,operation,baseId,brief){
    const group=job.exploration,base=group.options.find(option=>option.id===(baseId||group.selected||group.focused));assert(base,"请明确用哪个方案作为修改基线");
    const source=await sourceFor(job,base,request.optionSources?.[base.id]),reference={group:group.id,option:base.id,version:base.loadedVersion??latest(base).id};let option=base;
    if(operation==="fuse"){let index=group.options.length;while(group.options.some(item=>item.id===String.fromCharCode(97+index)))index++;const id=String.fromCharCode(97+index),label=String.fromCharCode(65+index);option={id,label,title:"融合方案 "+label,brief,source:reference,versions:[],state:"queued"};group.options.push(option);}
    job.state="running";group.phase=operation==="fuse"?"fusing":"refining";persist(job);await runOption(job,option,{source,brief,request:{...request,values:request.valuesSource?.option===base.id&&request.valuesSource.version===base.loadedVersion?request.values:undefined},refine:true});
    if(!job.controller.signal.aborted){group.focused=option.id;group.selected=option.id;ready(job,option.error??"「"+option.label+" · "+option.title+"」已就绪，原方案及历史版本保留。");}
  }
  async function continueDiscussion(job,request,{newRound=false}={}){
    const group=job.exploration;assert(job.state==="ready"&&!job.stopping,"请等待当前任务结束");const chosen=active(job),optionSources=Object.fromEntries(group.options.map(option=>[option.id,option.loadedVersion??latest(option)?.id])),valuesSource=chosen?{option:chosen.id,version:optionSources[chosen.id]}:undefined,source=chosen?await sourceFor(job,chosen,valuesSource.version):job;
    const planningGroup=newRound?{count:request.count??group.count,pages:request.pages??group.pages,options:[],parent:chosen?{group:group.id,option:chosen.id,version:chosen.loadedVersion??latest(chosen).id,label:chosen.label}:undefined,baseJobId:chosen?source.id:undefined,originalSnapshot:group.originalSnapshot,mode:"explore",conclusions:group.conclusions}:{...group,mode:group.options.length?"feedback":"explore"};
    return generate({...job.explorationRequest,...request,type:"message",role:request.role??job.role,permissionMode:"proposal",sessionId:job.sessionId,baseJob:undefined,optionSources,valuesSource,explore:{count:planningGroup.mode==="feedback"?1:planningGroup.count,pages:planningGroup.pages},prompt:request.prompt??"基于当前方案再探索，请先讨论本轮保留内容、变化方向与任务范围。"},{source,planningGroup,previous:job});
  }
  async function context(job,request){
    if(job.exploration)request.explorationContext={group:job.exploration.id,parent:job.exploration.parent,pages:job.exploration.pages,conclusions:job.exploration.conclusions,discussion:job.exploration.discussion??[],plan:job.exploration.plan};
    const supplied=request.optionReferences??[];assert(Array.isArray(supplied)&&supplied.length<=24&&JSON.stringify(supplied).length<=2000000,"跨方案引用过多或无效");const references=[...supplied];
    if(job.exploration?.mode==="feedback")for(const option of job.exploration.options){const version=request.optionSources?.[option.id]??option.loadedVersion??latest(option)?.id;if(version&&!references.some(ref=>ref.group===job.exploration.id&&ref.option===option.id&&ref.version===version))references.push({group:job.exploration.id,option:option.id,version});}
    const result=[],resolved=[];let index=0;
    for(const reference of references){
      const {group,option,version}=stored(job.requirement,job.candidate,reference),{directory,manifest:data}=files.reference(job.requirement,job.candidate,version.snapshot,job.temp,index++),page=reference.page??version.page;assert(data.pages.some(item=>item.id===page),"引用页面不属于对应方案版本");
      if(reference.selection)assert(typeof reference.selection.target==="string"&&JSON.stringify(reference.selection).length<=32000,"引用元素无效");let image;
      if(reference.capture){assert(reference.capture.page===page,"引用画面与页面不一致");image=await capture({capture:reference.capture,directory,signal:job.controller.signal});}
      if(!image&&reference.screenshot)image=files.restoreImage(job.requirement,job.candidate,reference.screenshot,directory);
      const screenshot=image?files.saveImage(job.requirement,job.candidate,image):undefined,meta={group:group.id,option:option.id,version:version.id,label:option.label,title:option.title,page,selection:reference.selection,state:reference.capture?.state??reference.state,snapshot:version.snapshot,screenshot};
      resolved.push(meta);result.push({...meta,directory,image});
    }
    request.resolvedOptionReferences=resolved;return result;
  }
  async function open(request){
    const group=files.read(request.id,request.candidate).groups.find(item=>item.id===request.group);assert(group,"方案轮次不存在或已删除");
    assert(![...loaded].some(job=>job.exploration?.id===group.id&&!ended.has(job.state)&&job.state!=="ready"),"此轮方案仍在处理，请先完成或停止");
    const parent=await restoreSaved(request,materialize(request.id,request.candidate,group,{snapshot:group.snapshot}),{parent:true});
    parent.exploration={...group,baseJobId:parent.id,phase:group.options.length?"comparing":"discussing",options:group.options.map(option=>({...option,state:latest(option)?"ready":"failed",error:latest(option)?option.error:option.error??"上次生成未完成，可以重试"}))};
    loaded.add(parent);parent.explorationRequest={...request,type:"message",permissionMode:"proposal",role:request.role??group.role,prompt:"继续已保存的设计方案："+(group.conclusions??group.summary??""),page:parent.page,expectedRevision:loadRequirement(workspace,request.id).revision,capture:{page:parent.page,state:parent.proposal.spec.state??{}}};
    await Promise.all(parent.exploration.options.filter(option=>latest(option)).map(async option=>{try{await sourceFor(parent,option);}catch(error){option.state="failed";option.error="方案重建失败，源资源仍保留："+error.message;}}));
    for(const previous of loaded)if(previous!==parent&&previous.requirement===parent.requirement&&previous.candidate===parent.candidate&&previous.exploration.id===group.id&&!ended.has(previous.state)){
      previous.state="superseded";finishMessage(previous,"superseded","此轮已在另一个预览中打开，请从方案历史继续。");previous.exploration={...previous.exploration,options:previous.exploration.options.map(({jobId,sessionId,...option})=>option)};cleanup(previous);
    }
    return view(parent);
  }
  function remove(request){
    const related=[...loaded].filter(job=>job.requirement===request.id&&job.candidate===request.candidate&&job.exploration.id===request.group);
    assert(!related.some(job=>job.stopping||(!ended.has(job.state)&&job.state!=="ready")),"此轮方案仍在处理，请先完成或停止");
    assert(Number.isInteger(request.historyVersion),"请刷新方案历史后再删除");
    files.mutate(request.id,request.candidate,request.historyVersion,groups=>{const index=groups.findIndex(item=>item.id===request.group);assert(index>=0,"方案轮次不存在");groups.splice(index,1);});
    for(const job of related){job.historyDeleted=true;job.state="discarded";cleanup(job);}files.collect(request.id,request.candidate);return {history:history(request.id,request.candidate),deleted:request.group};
  }
  function recover(job,error){if(!job.exploration?.id)return false;job.error=error;job.callActive=false;job.state="ready";job.exploration.phase=job.exploration.options.length?"comparing":"discussing";finishMessage(job,"ready",error,"failed");persist(job);return true;}
  async function handleRequest(job,request){
    if(!job){assert(request.type==="exploration","请选择方案轮次");if(request.action==="delete")return remove(request);assert(request.action==="open","请选择方案轮次");return open(request);}const group=job.exploration;
    assert(!job.historyDeleted&&!ended.has(job.state),"此任务已结束，请从历史打开方案后继续");
    if(request.type==="approval"){const option=group.options.find(option=>optionJob(option)?.pendingApprovals.has(request.approvalId));if(option){await event({...request,sessionId:option.sessionId,job:option.jobId});return view(job);}return null;}
    if(request.type==="message"||request.type==="generate")return continueDiscussion(job,request);
    if(request.type==="accept"){assert(job.state==="ready"&&!job.stopping,"当前方案正在处理");const option=active(job);assert(option,"请先选择要接受的方案");const child=await sourceFor(job,option),version=option.versions.find(item=>item.id===option.loadedVersion);let acceptedSnapshot;job.state="accepting";
      try{const result=await accept(child.id,request.values,{onValidated:current=>{acceptedSnapshot=files.saveSnapshot(job.requirement,job.candidate,loadRequirement(current.directory,job.requirement).folder);}});if(acceptedSnapshot!==version.snapshot){const accepted={...version,id:randomBytes(16).toString("hex"),number:option.versions.length+1,createdAt:Date.now(),snapshot:acceptedSnapshot,summary:version.summary+"（接受时调节）"};option.versions.push(accepted);option.loadedVersion=accepted.id;}option.acceptedVersion=option.loadedVersion;group.selected=option.id;job.state="accepted";finishMessage(job,"accepted","已接受「"+option.label+" · "+option.title+"」；探索历史仍保留");persist(job);cleanup(job);return {...view(job),revision:result.revision};}catch(error){ready(job);throw error;}}
    if(request.type==="cancel"||request.type==="discard"){assert(job.state!=="accepting"&&!ended.has(job.state)&&!job.stopping,"任务已结束或正在写回");job.stopping=true;job.controller.abort();
      await Promise.allSettled(group.options.map(async option=>{const child=optionJob(option);if(child&&!ended.has(child.state)&&child.state!=="ready")await event({type:"cancel",job:child.id,sessionId:option.sessionId});}));
      await job.done;job.callActive=false;job.state=request.type==="cancel"?"cancelled":"discarded";finishMessage(job,job.state,"本轮已停止，已保存的方案仍可从历史继续");persist(job);cleanup(job);job.stopping=false;return view(job);}
    assert(request.type==="exploration","方案操作无效");
    if(["focus","select","version"].includes(request.action)){const option=group.options.find(option=>option.id===request.option);assert(option,"方案不存在");assert(option.state==="ready"&&latest(option),"此方案正在生成或尚未就绪，请稍后再选择");await sourceFor(job,option,request.version);group.focused=option.id;if(request.action==="select")group.selected=option.id;else if(group.selected&&group.selected!==option.id)group.selected=undefined;persist(job);return view(job);}
    assert(job.state==="ready"&&!job.stopping,"请等待当前任务完成");
    if(request.action==="confirm"){assert(group.phase==="discussing"&&group.plan?.ready&&group.plan.operation==="explore","请先与主 Agent 确定本轮方向和范围");assert(request.planVersion===group.planVersion,"讨论方案已更新，请确认最新版本");assert(!group.options.length,"本轮方案已生成，请使用再探索");
      group.options=group.plan.directions.map((direction,index)=>{const id=String.fromCharCode(97+index),letter=id.toUpperCase();return {id,label:group.parent?group.parent.label+"-"+letter:letter,title:direction.title.trim(),brief:direction.brief.trim(),versions:[],state:"queued"};});job.appendTurn("确认生成 "+group.count+" 个方案");job.done=batch(job);return view(job);}
    if(request.action==="reexplore")return continueDiscussion(job,request,{newRound:true});
    if(request.action==="open")return open(request);
    const option=group.options.find(option=>option.id===request.option);assert(option,"方案不存在");
    if(request.action==="retry"){assert(option.state==="failed"&&!latest(option),"仅可重试尚未生成成功的方案");job.state="running";group.phase="generating";const retryRequest={...job.explorationRequest,...request,prompt:job.explorationRequest.prompt};job.done=runOption(job,option,{request:retryRequest}).finally(()=>{if(!job.controller.signal.aborted)ready(job);});return view(job);}
    assert(false,"方案操作无效");
  }
  async function handle(job,request){
    const key=[job?.requirement??request.id,job?.candidate??request.candidate,job?.exploration.id??request.group].join(":");
    assert(!operations.has(key),"此轮方案正在处理另一项操作，请稍后重试");operations.add(key);
    try{return await handleRequest(job,request);}finally{operations.delete(key);}
  }
  function dispose(job){if(!job.exploration||job.explorationDisposal)return job.explorationDisposal;archiveMessage(job);job.explorationDisposal=Promise.allSettled(job.exploration.options.map(async option=>{const child=optionJob(option);if(child&&!ended.has(child.state)&&child.state!=="ready")await event({type:"cancel",job:child.id,sessionId:option.sessionId});if(option.sessionId)await closeSession(option.sessionId);}));return job.explorationDisposal;}
  return {planned,planningPrompt,handle,decorate,dispose,context,history,recover,hasApprovals:job=>Boolean(job.exploration&&approvals(job).some(item=>item.state==="pending"))};
}
