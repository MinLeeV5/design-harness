import {createWorkbenchClient} from "../../api/workbench";
import {useEffect,useMemo,useRef,useState} from "react";
import type {AgentMessage,AgentPermissionMode,AgentProposal,DomSelection,Value,AgentRole,AgentSettings,AgentSettingsPatch,DesignReference,CodexConnection,CanvasCapture,AgentJob,AgentSession,AgentSessionSummary} from "../../../contracts/types";
import {controlValues,tuneProposal} from "../../../contracts/agent-controls.mjs";
import {defaultAgentSettings,mergeAgentSettings} from "../../../contracts/agent-settings.mjs";
type Context={id:string;candidate:string;page:string;scenario:string;reset:number;selection:DomSelection|null;revision:()=>string;token?:string;enabled:boolean;active:boolean;blocked:boolean;capture:()=>Promise<CanvasCapture>;onProposal:(value:AgentProposal|undefined)=>void;onAccepted:()=>Promise<void>};
type SessionState={loaded:boolean;messages:AgentMessage[];job:AgentJob|null;prompt:string;references:DesignReference[];values:Record<string,Value>;settings:AgentSettings;error:string;submitting:boolean;readingReferences:boolean;savingSettings:boolean;settingsError:string;depthNotice:string;connection:CodexConnection|null;checkingConnection:boolean;connectionError:string;version:number};
const fresh=():SessionState=>({loaded:false,messages:[],job:null,prompt:"",references:[],values:{},settings:defaultAgentSettings(),error:"",submitting:false,readingReferences:false,savingSettings:false,settingsError:"",depthNotice:"",connection:null,checkingConnection:false,connectionError:"",version:0});
const empty=fresh();
const running=(job:AgentJob|null)=>!!job&&["running","validating","accepting"].includes(job.state);

export function useAgent(context:Context){
  const api=useMemo(()=>createWorkbenchClient(context.token),[context.token]),current=useRef(context);current.current=context;
  const cache=useRef<Record<string,SessionState>>({}),active=useRef(""),mounted=useRef(true),connectionTasks=useRef(new Set<string>()),unboundDrafts=useRef<Record<string,string>>({}),selectionEpoch=useRef<Record<string,number>>({}),unsavedSettings=useRef<Record<string,AgentSettingsPatch[]>>({}),snapshotSerial=useRef<Record<string,number>>({});
  const [,render]=useState(0),[lists,setLists]=useState<Record<string,AgentSessionSummary[]>>({}),[selected,setSelected]=useState<Record<string,string>>({}),[scopeErrors,setScopeErrors]=useState<Record<string,string>>({}),[creating,setCreating]=useState(false);
  const scope=context.id+":"+context.candidate,sessionId=selected[scope]??"",state=cache.current[sessionId]??empty;active.current=sessionId;
  const update=(id:string,patch:Partial<SessionState>)=>{cache.current[id]={...(cache.current[id]??fresh()),...patch};if(mounted.current)render(n=>n+1);};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const remember=(key:string,id:string)=>{selectionEpoch.current[key]=(selectionEpoch.current[key]??0)+1;setSelected(old=>({...old,[key]:id}));try{sessionStorage.setItem("dh-agent:"+key,id);}catch{/* Optional local UI state. */}};
  function receive(id:string,job:AgentJob|null,messages?:AgentMessage[]){
    const previous=cache.current[id]??fresh(),sameReady=job?.state==="ready"&&previous.job?.id===job.id&&previous.job.state==="ready";
    if(!job&&!previous.job&&JSON.stringify(messages??[])===JSON.stringify(previous.messages))return;
    const values=sameReady?previous.values:job?.proposal?controlValues(job.proposal.controls??[],job.proposal.spec,job.proposal.css):previous.job?.proposal?{}:previous.values;
    update(id,{job:sameReady?{...job,proposal:previous.job!.proposal}:job,values,messages:messages??job?.messages??previous.messages});
  }
  const beginSnapshot=(id:string)=>{const serial=(snapshotSerial.current[id]??0)+1;snapshotSerial.current[id]=serial;return {serial,version:cache.current[id]?.version??0};};
  const currentSnapshot=(id:string,read:{serial:number;version:number})=>snapshotSerial.current[id]===read.serial&&(cache.current[id]?.version??0)===read.version&&!cache.current[id]?.submitting;
  function restore(snapshot:AgentSession){
    if(!cache.current[snapshot.id]?.loaded)update(snapshot.id,{loaded:true,settings:{identity:snapshot.identity,model:snapshot.model,efforts:snapshot.efforts,permissionMode:snapshot.permissionMode,...(snapshot.warning?{warning:snapshot.warning}:{})}});
    receive(snapshot.id,snapshot.job,snapshot.messages);
  }
  useEffect(()=>{
    if(!context.enabled)return;let cancelled=false;const epoch=selectionEpoch.current[scope]??0;
    void api.sessions(context.id,context.candidate).then(async list=>{
      if(cancelled)return;setLists(old=>JSON.stringify(old[scope])===JSON.stringify(list)?old:{...old,[scope]:list});let saved="";try{saved=sessionStorage.getItem("dh-agent:"+scope)??"";}catch{}
      const id=list.find(s=>s.id===(selected[scope]||saved))?.id??list[0]?.id;if(!id)return;
      const read=beginSnapshot(id),snapshot=await api.session(context.id,context.candidate,id);if(cancelled)return;if(currentSnapshot(id,read))restore(snapshot);if(unboundDrafts.current[scope]){update(id,{prompt:unboundDrafts.current[scope]});delete unboundDrafts.current[scope];}if((selectionEpoch.current[scope]??0)===epoch)remember(scope,id);setScopeErrors(old=>({...old,[scope]:""}));
    }).catch(error=>{if(!cancelled)setScopeErrors(old=>({...old,[scope]:error.message}));});
    return()=>{cancelled=true;};
  },[scope,context.enabled]);
  async function refreshConnection(refresh=false,id=active.current){
    if(!id||connectionTasks.current.has(id))return;connectionTasks.current.add(id);update(id,{checkingConnection:true});
    try{update(id,{connection:await api.connection(refresh,id),connectionError:""});}catch(error){update(id,{connectionError:(error as Error).message});}
    finally{connectionTasks.current.delete(id);update(id,{checkingConnection:false});}
  }
  useEffect(()=>{if(context.enabled&&context.active&&sessionId)void refreshConnection();},[sessionId,context.enabled,context.active]);
  useEffect(()=>{
    if(!context.enabled)return;let cancelled=false,pending=false;
    const timer=setInterval(async()=>{
      if(pending)return;pending=true;const id=active.current,previous=cache.current[id],read=id&&!previous?.submitting?beginSnapshot(id):null;
      try{
        const [list,snapshot]=await Promise.all([api.sessions(context.id,context.candidate),id&&!previous?.submitting?api.session(context.id,context.candidate,id):Promise.resolve(null)]);
        if(cancelled)return;setLists(old=>JSON.stringify(old[scope])===JSON.stringify(list)?old:{...old,[scope]:list});
        if(snapshot&&read&&currentSnapshot(id,read)){const changed=cache.current[id]?.job?.state!==snapshot.job?.state;restore(snapshot);if(changed)void refreshConnection(false,id);}
      }catch(error){if(!cancelled&&id)update(id,{error:(error as Error).message});}finally{pending=false;}
    },800);return()=>{cancelled=true;clearInterval(timer);};
  },[scope,context.enabled]);
  async function selectSession(id:string){
    if(!(lists[scope]??[]).some(item=>item.id===id))return;remember(scope,id);
    try{const read=beginSnapshot(id),snapshot=await api.session(context.id,context.candidate,id);if(currentSnapshot(id,read))restore(snapshot);}catch(error){update(id,{error:(error as Error).message});}
  }
  async function newSession(){
    if(creating)return;setCreating(true);const epoch=(selectionEpoch.current[scope]??0)+1;selectionEpoch.current[scope]=epoch;
    try{const snapshot=await api.createSession(context.id,context.candidate);restore(snapshot);setLists(old=>({...old,[scope]:[...(old[scope]??[]),snapshot]}));if((selectionEpoch.current[scope]??0)===epoch)remember(scope,snapshot.id);setScopeErrors(old=>({...old,[scope]:""}));}
    catch(error){setScopeErrors(old=>({...old,[scope]:(error as Error).message}));}finally{setCreating(false);}
  }
  const preferences=state.settings,connection=state.connection,modelId=preferences.model||connection?.defaultModel||"",modelInfo=connection?.models.find(item=>item.id===modelId),rememberedEffort=preferences.efforts[modelId]??"",effort=modelInfo?.efforts.includes(rememberedEffort)?rememberedEffort:"";
  async function chooseSettings(patch:AgentSettingsPatch){
    const id=sessionId,previous=cache.current[id];if(!previous||previous.submitting||previous.savingSettings||running(previous.job))return;
    const next=mergeAgentSettings(previous.settings,patch);update(id,{settings:next,savingSettings:true,settingsError:"",depthNotice:"",version:previous.version+1});
    const pending=unsavedSettings.current[id]??=[];pending.push(patch);
    try{let saved:AgentSettings|undefined;while(pending.length){saved=await api.saveSettings(context.id,context.candidate,pending[0],id);pending.shift();}if(saved)update(id,{settings:saved});}
    catch{update(id,{settingsError:"本次选择仍可使用，但未能保存偏好。请重试。"});}finally{update(id,{savingSettings:false});}
  }
  useEffect(()=>{if(sessionId&&modelInfo&&rememberedEffort&&!modelInfo.efforts.includes(rememberedEffort)&&!state.savingSettings&&!state.submitting&&!running(state.job)){void chooseSettings({effort:{model:modelId,value:""}});update(sessionId,{depthNotice:"当前模型不再支持上次的思考深度，已恢复自动。"});}},[sessionId,modelId,modelInfo,rememberedEffort,state.savingSettings]);
  function retrySettings(){void chooseSettings({identity:preferences.identity,model:preferences.model,permissionMode:preferences.permissionMode,...(modelId?{effort:{model:modelId,value:effort}}:{})});}
  async function addReferences(files:FileList|null){
    const id=sessionId;if(!files?.length||!id)return;update(id,{error:"",readingReferences:true});
    try{if(state.references.length+files.length>3)throw new Error("最多附加3张参考图");const added=await Promise.all([...files].map(file=>new Promise<DesignReference>((resolve,reject)=>{if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>3000000){reject(new Error("参考图支持PNG、JPEG、WebP，每张最大3MB"));return;}const reader=new FileReader();reader.onerror=()=>reject(new Error("无法读取参考图"));reader.onload=()=>resolve({id:crypto.randomUUID(),name:file.name.slice(0,160),data:String(reader.result)});reader.readAsDataURL(file);})));update(id,{references:[...cache.current[id].references,...added].slice(0,3)});}
    catch(error){update(id,{error:(error as Error).message});}finally{update(id,{readingReferences:false});}
  }
  const waiting=running(state.job),sessionReady=state.loaded,proposalMatches=state.job?.candidate===context.candidate&&state.job?.page===context.page;
  // Background results stay in their session. Only the selected, matching proposal reaches the canvas.
  useEffect(()=>{current.current.onProposal(state.job?.state==="ready"&&proposalMatches&&state.job.proposal?tuneProposal(state.job.proposal,state.values):undefined);},[sessionId,state.job?.proposal,state.job?.state,state.values,context.candidate,context.page,context.scenario,context.reset]);
  async function generate(){
    const id=sessionId,local=cache.current[id];
    if(!context.enabled||!local?.loaded||local.savingSettings||context.blocked||local.submitting||running(local.job)||local.readingReferences||!local.prompt.trim()||!connection?.available||connection.auth==="required"||state.checkingConnection||state.connectionError)return;
    if(local.job?.state==="ready"&&!proposalMatches){update(id,{error:"请回到提案页面继续调整，或先接受、放弃当前提案。"});return;}
    update(id,{error:"",submitting:true,version:local.version+1});const requestContext=context,selection=context.selection?structuredClone(context.selection):null;
    try{const revision=context.revision(),capture=await requestContext.capture();const result=await api.event({type:"message",sessionId:id,role:local.settings.identity,model:local.settings.model,permissionMode:local.settings.permissionMode,effort,capture,references:local.references.map(({name,data})=>({name,data})),id:requestContext.id,candidate:requestContext.candidate,page:requestContext.page,scenario:requestContext.scenario,prompt:local.prompt,selection,expectedRevision:revision,...(local.job?.state==="ready"?{baseJob:local.job.id,values:local.values}:{})});receive(id,result);update(id,{prompt:""});void refreshConnection(false,id);}
    catch(error){update(id,{error:(error as Error).message});}finally{update(id,{submitting:false});}
  }
  async function decideApproval(approvalId:string,decision:"accept"|"decline"|"cancel",content?:Record<string,unknown>){
    const id=sessionId,local=cache.current[id],job=local?.job;if(!job||local.submitting)return;
    update(id,{submitting:true,error:"",version:local.version+1});
    try{receive(id,await api.event({type:"approval",sessionId:id,job:job.id,approvalId,decision,...(content?{content}:{})}));}
    catch(error){update(id,{error:(error as Error).message});}finally{update(id,{submitting:false});}
  }
  async function finish(type:"accept"|"discard"|"cancel"){
    const id=sessionId,local=cache.current[id],job=local?.job;if(!job||local.submitting||(type==="accept"&&context.blocked))return;
    update(id,{submitting:true,error:"",version:local.version+1,...(type==="accept"?{job:{...job,state:"accepting"}}:{})});
    try{const result=await api.event({type,sessionId:id,job:job.id,...(type==="accept"?{values:local.values}:{})});receive(id,result);if(result.state==="accepted")await current.current.onAccepted();void refreshConnection(false,id);}
    catch(error){update(id,{error:(error as Error).message});try{receive(id,await api.job(job.id,id));update(id,{values:local.values});}catch{update(id,{job});}}finally{update(id,{submitting:false});}
  }
  function tune(id:string,value:Value){if(!state.job?.proposal||waiting||state.submitting)return;try{const values={...state.values,[id]:value};tuneProposal(state.job.proposal,values);update(sessionId,{values,error:""});}catch(error){update(sessionId,{error:(error as Error).message});}}
  return {sessionId,sessions:lists[scope]??[],selectSession,newSession,creating,proposalMatches,prompt:sessionId?state.prompt:unboundDrafts.current[scope]??"",setPrompt:(prompt:string)=>{if(sessionId)update(sessionId,{prompt});else{unboundDrafts.current[scope]=prompt;render(n=>n+1);}},sessionReady,savingSettings:state.savingSettings,settingsError:state.settingsError||preferences.warning||"",retrySettings,permissionMode:preferences.permissionMode,setPermissionMode:(permissionMode:AgentPermissionMode)=>void chooseSettings({permissionMode}),decideApproval,effort,setEffort:(value:string)=>{if(modelId)void chooseSettings({effort:{model:modelId,value}});},depthNotice:state.depthNotice,identity:preferences.identity,setIdentity:(identity:AgentRole)=>{if(state.job?.state!=="ready")void chooseSettings({identity});},model:preferences.model,setModel:(model:string)=>void chooseSettings({model}),observation:state.job?.observation??connection?.observation,connection,checkingConnection:state.checkingConnection,connectionError:state.connectionError,refreshConnection,references:state.references,addReferences,removeReference:(id:string)=>update(sessionId,{references:state.references.filter(item=>item.id!==id)}),readingReferences:state.readingReferences,messages:state.messages,job:state.job,error:state.error||scopeErrors[scope]||"",busy:state.submitting||waiting||state.job?.state==="ready"||state.readingReferences,waiting,submitting:state.submitting,values:state.values,generate,finish,tune};
}
