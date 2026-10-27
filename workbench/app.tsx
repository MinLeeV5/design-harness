import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import type {BundleData,Manifest,Scenario,Value,PreviewContext,Annotation,DomSelection,AgentProposal,NavigationCommand} from "./types";
import "./studio.css";
import {InteractionReader,annotationsFor} from "./interaction-reader";
import {useAgent,AgentPanel} from "./live-agent";
import {captureFrame} from "./capture";
import harnessIcon from "./assets/harness-icon.png";
const data=(window as unknown as {__DH_DATA__:BundleData}).__DH_DATA__;
const initial=new URLSearchParams(location.hash.slice(1));

type Panel = "docs" | "agent" | "tools";
function ToolIcon({view}:{view:Panel}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {view==="docs"?<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>:view==="tools"?<><path d="M4 7h6m5 0h5M4 17h10m5 0h1"/><circle cx="12.5" cy="7" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/></>:<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>}
  </svg>;
}
const loadedValues=(candidate:string,page:string):Record<string,Value>=>Object.fromEntries(data.manifest.controls.filter(c=>c.page===page).map(c=>[c.id,data.specs[candidate+":"+page].elements[c.target].props[c.property] as Value]));
const allValues=()=>Object.fromEntries(data.manifest.candidates.flatMap(c=>data.manifest.pages.map(p=>[c.id+":"+p.id,loadedValues(c.id,p.id)])));
function Frame({candidate,page,scenario,viewport,values,pick,locate,instance,annotations,showAnnotations,inspectDomId,locateNonce,proposal,runtimeState,navigationRequest,hidden,active,order,waiting,onActivate,onIntent,onPrepared,onContext,onSelect,onElements,onEscape,onError}:{candidate:string;page:string;scenario:Scenario;viewport:Manifest["viewports"][number];
  values:Record<string,Value>;pick:boolean;locate:string;instance:string;annotations:Annotation[];showAnnotations:boolean;inspectDomId:string;locateNonce:number;proposal?:AgentProposal;runtimeState?:Record<string,unknown>;navigationRequest?:NavigationCommand;hidden:boolean;active:boolean;order:number;waiting:boolean;onActivate:()=>void;onIntent:(page:string)=>void;onPrepared:(serial:number,allowed:boolean)=>void;onContext:(context:PreviewContext)=>void;onSelect:(id:string,instance:string,detail?:DomSelection,annotationId?:string)=>void;onElements:(ids:string[],duplicates:string[])=>void;onEscape:()=>void;onError:(error:string)=>void}) {
  const ref=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null);
  const [available,setAvailable]=useState({width:viewport.width,height:viewport.height});
  useEffect(()=>{onError("");},[]);
  const spec=structuredClone(proposal?.spec??data.specs[candidate+":"+page]);
  if(!proposal)for(const c of data.manifest.controls.filter(c=>c.page===page))spec.elements[c.target].props[c.property]=values[c.id];
  const config={scenario,candidate,page,pages:data.manifest.pages.map(p=>p.id),initialState:runtimeState,navigation:data.manifest.navigation,session:candidate+":"+scenario.id,spec,css:proposal?.css??data.params[candidate].css,pick,locate,instance,annotations,showAnnotations,inspectDomId,locateNonce};
  const current=useRef(config); current.current=config;
  const send=()=>ref.current?.contentWindow?.postMessage({type:"dh:config",config:current.current},"*");
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setAvailable({width:entries[0].contentRect.width,height:entries[0].contentRect.height}));
    if(box.current)observer.observe(box.current);return()=>observer.disconnect();
  },[]);
  useEffect(send,[candidate,page,scenario,values,pick,locate,instance,showAnnotations,inspectDomId,locateNonce,proposal,annotations]);
  const navRef=useRef(navigationRequest),sentNavigation=useRef(""),frameReady=useRef(false);navRef.current=navigationRequest;
  const sendNavigation=()=>{const request=navRef.current;if(frameReady.current&&request&&request.serial+":"+request.phase!==sentNavigation.current){sentNavigation.current=request.serial+":"+request.phase;ref.current?.contentWindow?.postMessage({type:"dh:navigate",...request,session:current.current.session},"*");}};
  useEffect(sendNavigation,[navigationRequest]);
  useEffect(()=>{
    function receive(event:MessageEvent) {
      if(event.source!==ref.current?.contentWindow)return;
      if(event.data?.type==="dh:mounted"){frameReady.current=false;send();}
      if(event.data?.type==="dh:context"&&event.data.session===current.current.session&&data.manifest.pages.some(p=>p.id===event.data.context?.page)&&event.data.context.state&&typeof event.data.context.state==="object"&&!Array.isArray(event.data.context.state)){frameReady.current=true;onContext(event.data.context);sendNavigation();}
      if(event.data?.type==="dh:navigation-intent"&&event.data.session===current.current.session&&data.manifest.pages.some(p=>p.id===event.data.page))onIntent(event.data.page);
      if(event.data?.type==="dh:navigation-prepared"&&event.data.session===current.current.session&&Number.isInteger(event.data.serial)&&typeof event.data.allowed==="boolean")onPrepared(event.data.serial,event.data.allowed);
      if(event.data?.type==="dh:escape")onEscape();
      if(event.data?.type==="dh:error" && typeof event.data.error==="string")onError(event.data.error);
      if(event.data?.type==="dh:select" && typeof event.data.id==="string")onSelect(event.data.id,typeof event.data.instance==="string"?event.data.instance:"",event.data.selection);
      if(event.data?.type==="dh:annotation"&&typeof event.data.id==="string")onSelect(event.data.id,event.data.instance??"",undefined,event.data.annotationId);
      if(event.data?.type==="dh:elements" && Array.isArray(event.data.ids))onElements(event.data.visibleIds??event.data.ids,event.data.duplicates??[]);
    }
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[candidate,onContext,onSelect,onElements,onEscape,onError,onIntent,onPrepared]);
  const initialPreview=useMemo(()=>data.previews[scenario.page+":"+candidate],[candidate,scenario.id]);
  const scale=Math.min(1,Math.max(0.05,available.width/viewport.width),Math.max(0.05,(available.height-28)/viewport.height));
  return <div className="frame-column" data-candidate={candidate} data-active={active} hidden={hidden} style={{order}} ref={box}>
    <div className="frame-label"><button className="frame-focus" aria-pressed={active} aria-label={"编辑方案 · "+candidate} onClick={onActivate}>{data.manifest.candidates.find(c=>c.id===candidate)?.title}{active?" · 当前编辑":""}</button><span>{viewport.width} × {viewport.height} · {Math.round(scale*100)}%</span></div>
    <div className="frame-clip" inert={waiting} style={{width:viewport.width*scale,height:viewport.height*scale}}>
      <iframe ref={ref} title={"产品预览 · "+candidate} sandbox="allow-scripts allow-downloads" srcDoc={proposal?.html??initialPreview}
        onLoad={()=>{send();sendNavigation();}} style={{width:viewport.width,height:viewport.height,transform:"scale("+scale+")"}}/>
    </div>
    {waiting&&<div className="frame-navigation-wait" role="status">已确认离开，等待另一方案…</div>}
  </div>;
}
function App() {
  const manifest=data.manifest;
  const [page,setPage]=useState(manifest.pages.find(p=>p.id===initial.get("page"))?.id??manifest.pages[0].id);
  const [scenarioId,setScenario]=useState(data.scenarios.find(s=>s.id===initial.get("scenario")&&s.page===page)?.id??data.scenarios.find(s=>s.page===page)!.id);
  const [candidate,setCandidate]=useState(manifest.candidates.find(c=>c.id===initial.get("candidate"))?.id??manifest.candidates[0].id);
  const [viewportId,setViewport]=useState(manifest.viewports.find(v=>v.id===initial.get("viewport"))?.id??manifest.viewports[0].id);
  const [compare,setCompare]=useState(false),[comparisonIds,setComparisonIds]=useState<string[]>(manifest.candidates.slice(0,2).map(c=>c.id)),[pick,setPick]=useState(false),[selected,setSelected]=useState("");
  const [showAnnotations,setShowAnnotations]=useState(false),[selection,setSelection]=useState<DomSelection|null>(null),[inspectDomId,setInspectDomId]=useState(""),[locateNonce,setLocateNonce]=useState(0);
  const [proposal,setProposal]=useState<AgentProposal|undefined>(),[annotationFocus,setAnnotationFocus]=useState(0);
  const interactions=proposal?.interactions??data.interactions;
  const pickedCandidate=useRef("");
  const [selectionStale,setSelectionStale]=useState(false);const proposalDocument=useRef<string|undefined>(undefined);
  const [panel,setPanel]=useState<Panel|null>(null),[settingsOpen,setSettingsOpen]=useState(false),[status,setStatus]=useState("");
  const settingsTrigger=useRef<HTMLButtonElement>(null),settingsClose=useRef<HTMLButtonElement>(null),toolsTrigger=useRef<HTMLButtonElement>(null);
  const values=useMemo(allValues,[]);
  const [previewErrors,setPreviewErrors]=useState<Record<string,string>>({});
  const scope=candidate+":"+page;
  const revisionRef=useRef(data.revision),pollGeneration=useRef(0);
  const [exporting,setExporting]=useState(false);
  const exportingRef=useRef(false);
  const acceptedNavigationRef=useRef(false);
  const [elements,setElements]=useState<string[]>([]),[duplicates,setDuplicates]=useState<string[]>([]);
  const [reset,setReset]=useState(0),[instance,setInstance]=useState("");
  const [contexts,setContexts]=useState<Record<string,PreviewContext>>({}),[navigationCommands,setNavigationCommands]=useState<Record<string,NavigationCommand>>({}),[selectedAnnotation,setSelectedAnnotation]=useState("");
  const navigation=useRef<{serial:number;page:string;ids:string[];ready:Set<string>}|null>(null);
  const [waitingCandidates,setWaitingCandidates]=useState<string[]>([]),[navigationPending,setNavigationPending]=useState(false);
  const navSerial=useRef(0),contextInitial=useRef<Record<string,string>>({});
  const [interacting,setInteracting]=useState(false);
  const docRef=useRef<HTMLDivElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const triggerRef=useRef<HTMLElement|null>(null);
  function showPanel(view:Panel,trigger?:HTMLElement) {
    if(view==="docs")setShowAnnotations(true);
    if(trigger)triggerRef.current=trigger;
    else if(!panel && document.activeElement instanceof HTMLElement)triggerRef.current=document.activeElement;
    if(matchMedia("(max-width:700px)").matches)setSettingsOpen(false);
    setPanel(view);
  }
  function closePanel() {
    setPanel(null);setPick(false);
    requestAnimationFrame(()=>{if(triggerRef.current?.isConnected)triggerRef.current.focus({preventScroll:true});});
  }
  useEffect(()=>{if(panel&&!pick)closeButton.current?.focus({preventScroll:true});},[panel,pick]);
  useEffect(()=>{if(settingsOpen)settingsClose.current?.focus({preventScroll:true});},[settingsOpen]);
  useEffect(()=>{const viewport=matchMedia("(max-width:700px)");const adapt=()=>{if(viewport.matches&&panel)setSettingsOpen(false);};adapt();viewport.addEventListener("change",adapt);return()=>viewport.removeEventListener("change",adapt);},[panel]);
  function closeSettings(){setSettingsOpen(false);requestAnimationFrame(()=>settingsTrigger.current?.focus({preventScroll:true}));}
  function exitTools(){if(pick){setPick(false);return;}if(panel){closePanel();return;}if(settingsOpen)closeSettings();}
  useLayoutEffect(()=>{if(annotationFocus&&panel==="docs")closeButton.current?.focus({preventScroll:true});},[annotationFocus,panel]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape" && (panel||pick||settingsOpen)) {event.preventDefault();exitTools();}
    };
    window.addEventListener("keydown",escape);
    return()=>window.removeEventListener("keydown",escape);
  },[panel,pick,settingsOpen]);
  const scenario=data.scenarios.find(s=>s.id===scenarioId)!;
  const viewport=manifest.viewports.find(v=>v.id===viewportId)!;
  const alternate=manifest.candidates.find(c=>c.id!==candidate);
  const agent=useAgent({id:manifest.id,candidate,page,scenario:scenario.id,reset,selection,revision:()=>revisionRef.current,token:data.token,enabled:data.development,blocked:exporting||navigationPending,capture:()=>{const frame=document.querySelector<HTMLIFrameElement>('.frame-column[data-candidate="'+candidate+'"] iframe');if(!frame)return Promise.reject(new Error("当前画面尚未加载"));return captureFrame(frame,page,contexts[candidate]?.state??{...data.specs[candidate+":"+page].state,...scenario.state});},onProposal:value=>{if(proposalDocument.current!==value?.html){if(selection)setSelectionStale(true);setInspectDomId("");}proposalDocument.current=value?.html;setProposal(value);setPick(false);},onAccepted:()=>{acceptedNavigationRef.current=true;location.reload();}});
  const agentBusyRef=useRef(false);agentBusyRef.current=agent.busy;
  const previewError=(compare?comparisonIds:[candidate]).map(id=>id+":"+(contexts[id]?.page??page)).map(key=>previewErrors[key]).filter(Boolean).join("；");
  function reportError(key:string,error:string){setPreviewErrors(old=>old[key]===error?old:{...old,[key]:error});}
  useEffect(()=>{
    const state=new URLSearchParams({page,scenario:scenario.id,candidate,viewport:viewportId});
    history.replaceState(null,"","#"+state);
  },[page,scenario,candidate,viewportId]);
  useEffect(()=>{
    if(!data.development)return;
    let pending=false,cancelled=false;
    const timer=setInterval(async()=>{
      if(pending || exportingRef.current || agentBusyRef.current)return;
      pending=true;const generation=pollGeneration.current;
      try {
        const response=await fetch("/__dh/revision?id="+manifest.id);
        if(response.ok) {
          const revision=(await response.json()).revision;
          if(!cancelled && generation===pollGeneration.current && !exportingRef.current && !agentBusyRef.current && revision!==revisionRef.current)location.reload();
        }
      } catch {/* 页面保留当前内容，服务恢复后再次读取。 */}
      finally {pending=false;}
    },1400);
    return()=>{cancelled=true;clearInterval(timer);};
  },[manifest.id]);
  useEffect(()=>{
    if(!selected)return;
    const section=selectedAnnotation||interactions.find(a=>(a.page===page||a.page==="*")&&a.target===selected)?.id;
    const target=section ? docRef.current?.querySelector("#"+CSS.escape(section)) : null;
    docRef.current?.querySelectorAll(".active-section").forEach(el=>el.classList.remove("active-section"));
    target?.classList.add("active-section");target?.scrollIntoView({block:"nearest"});
  },[selected,selectedAnnotation,page,panel]);
  useEffect(()=>{
    const leave=(event:BeforeUnloadEvent)=>{if(!acceptedNavigationRef.current&&(exportingRef.current||agentBusyRef.current)){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);
  },[]);
  const select=(id:string,address:string,detail?:DomSelection,annotationId?:string)=>{setPick(false);setSelected(id);setInstance(address);setSelection(detail??null);setSelectionStale(false);setInspectDomId(detail?.domId??"");setSelectedAnnotation(annotationId??interactions.find(a=>(a.page===page||a.page==="*")&&a.target===id)?.id??"");if(annotationId)setLocateNonce(v=>v+1);showPanel(annotationId?"docs":"agent");if(annotationId)setAnnotationFocus(value=>value+1);};
  function locateAnnotation(a:Annotation){setSelectedAnnotation(a.id);setSelected(a.target);setInstance("");setSelection(null);setInspectDomId("");setLocateNonce(v=>v+1);}
  useEffect(()=>{setProposal(undefined);if(pickedCandidate.current===candidate){pickedCandidate.current="";return;}setSelection(null);setSelectionStale(false);setInspectDomId("");},[page,scenarioId,candidate,reset]);
  const observe=(ids:string[],dupes:string[])=>{setElements(ids);setDuplicates(dupes);};
  function download(name:string,content:string|Blob) {
    const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type:"application/json"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportDesign() {
    if(exportingRef.current||agentBusyRef.current)return;
    exportingRef.current=true;setExporting(true);pollGeneration.current++;setStatus("正在生成离线 HTML…");
    try {
      const response=await fetch("/__dh/export",{method:"POST",headers:{"Content-Type":"application/json","X-DH-Token":data.token!},body:JSON.stringify({id:manifest.id})});
      if(!response.ok)throw new Error((await response.json()).error);
      download(manifest.id+".html",await response.blob());setStatus("已下载离线 HTML");
    } catch(error) {setStatus("导出失败："+(error as Error).message);}
    finally{exportingRef.current=false;setExporting(false);}
  }

  const runtimeState=contexts[candidate]?.state??{...data.specs[candidate+":"+page].state,...scenario.state};
  const annotations=annotationsFor(interactions,page,runtimeState);
  const missing=annotations.filter(a=>!elements.includes(a.target));
  function observeContext(id:string,context:PreviewContext){
    const signature=JSON.stringify(context);if(!contextInitial.current[id])contextInitial.current[id]=signature;
    setContexts(old=>JSON.stringify(old[id])===signature?old:{...old,[id]:context});
    if(id===candidate){if(context.page!==page){setPage(context.page);setSelected("");setSelectedAnnotation("");setInstance("");setElements([]);}if(signature!==contextInitial.current[id])setInteracting(true);}
  }
  function commands(ids:string[],command:NavigationCommand){setNavigationCommands(old=>({...old,...Object.fromEntries(ids.map(id=>[id,command]))}));}
  function cancelNavigation(){setNavigationPending(false);setWaitingCandidates([]);const pending=navigation.current;if(pending){commands(pending.ids,{serial:pending.serial,page:pending.page,phase:"abort"});navigation.current=null;}}
  function navigate(next:string,origin=candidate,ids=compare&&comparisonIds.includes(origin)?comparisonIds:[origin]){
    if(agentBusyRef.current){setStatus("请先接受、放弃或取消当前生成，再切换页面");return;}
    cancelNavigation();setNavigationPending(true);const serial=++navSerial.current;navigation.current={serial,page:next,ids,ready:new Set()};
    commands(ids,{serial,page:next,phase:"prepare"});setStatus(ids.length>1?"正在检查两侧的离开保护…":"正在检查页面切换…");
  }
  function prepared(id:string,serial:number,allowed:boolean){
    const pending=navigation.current;if(!pending||pending.serial!==serial||!pending.ids.includes(id))return;
    if(!allowed){cancelNavigation();setStatus(pending.ids.length>1?"已取消切换，两侧页面与输入均保留":"已取消页面切换");return;}
    pending.ready.add(id);setWaitingCandidates([...pending.ready]);if(pending.ready.size===pending.ids.length){navigation.current=null;setNavigationPending(false);setWaitingCandidates([]);commands(pending.ids,{serial,page:pending.page,phase:"commit"});setStatus(pending.ids.length>1?"两侧已切换到同一页面，业务操作与输入分别保留":"");}
  }
  function focusCandidate(id:string){
    if(compare&&!comparisonIds.includes(id)){const ids=comparisonIds.map(old=>old===candidate?id:old);setComparisonIds(ids);navigate(page,id,ids);}
    setCandidate(id);setPage(contexts[id]?.page??scenario.page);setLocateNonce(value=>value+1);setElements([]);setSelection(null);setInspectDomId("");
  }
  function toggleCompare(){cancelNavigation();if(!compare){const ids=comparisonIds.includes(candidate)?comparisonIds:[candidate,manifest.candidates.find(c=>c.id!==candidate)!.id];setComparisonIds(ids);setCompare(true);navigate(page,candidate,ids);}else setCompare(false);}
  function chooseScenario(next:string){const preset=data.scenarios.find(s=>s.id===next)!;setScenario(next);setPage(preset.page);setReset(value=>value+1);setContexts({});contextInitial.current={};setInteracting(false);cancelNavigation();setSelected("");setSelectedAnnotation("");setInstance("");setElements([]);}

  const panelNames:Record<Panel,string>={docs:"交互说明",agent:"Agent",tools:"工具"};
  const locate=panel||pick ? selected : "";
  const workbenchStatus=previewError?"预览失败："+previewError:status||(agent.job?.state==="ready"?"有待确认的生成预览，请在 Agent 中继续调整":"直接操作页面，体验当前流程");
  return <div className="studio-shell" data-picking={pick}>
    <header className="studio-header">
      <button ref={settingsTrigger} className="drawer-trigger" aria-label="预览设置" title="预览设置" aria-expanded={settingsOpen} aria-controls="studio-settings" onClick={()=>{if(settingsOpen)closeSettings();else{if(matchMedia("(max-width:700px)").matches)setPanel(null);setSettingsOpen(true);setPick(false);}}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1M5.5 12h1"/></svg><span>预览</span></button>
      <a className="studio-brand" href="#" onClick={event=>event.preventDefault()}><img className="brand-mark" src={harnessIcon} alt=""/><span>Design Harness</span></a>
      <div className="requirement-title"><h1 title={manifest.title}>{manifest.title}</h1><span>{manifest.pages.find(p=>p.id===page)?.title} · {manifest.viewports.find(v=>v.id===viewportId)?.title}</span></div>
      <span className="workspace-kind">{data.proposal?"提案预览 · 尚未写入":data.development?"本地草稿":"离线预览"}</span>
      <button ref={toolsTrigger} className="drawer-trigger" aria-label="工作台工具" title="说明、Agent 与工具" aria-expanded={panel!==null} aria-controls="studio-inspector" onClick={event=>panel?closePanel():showPanel("agent",event.currentTarget)}><ToolIcon view="agent"/><span>工具</span>{agent.waiting?<span className="loading-spinner" aria-label="Agent 正在处理"/>:agent.job?.state==="ready"&&<span className="unsaved-dot" aria-hidden="true"/>}</button>
    </header>
    <main className="studio-main">
      <section className={"preview-stage "+(compare?"comparing":"")} aria-label="设计预览">
        {manifest.candidates.map(item=>{
          const id=item.id,active=id===candidate,currentPage=contexts[id]?.page??scenario.page,state=contexts[id]?.state??{...data.specs[id+":"+currentPage].state,...scenario.state};
          return <Frame key={id+":"+scenario.id+":"+reset} candidate={id} page={currentPage} scenario={scenario} viewport={viewport} values={values[id+":"+currentPage]} hidden={compare?!comparisonIds.includes(id):!active} active={active} order={compare?comparisonIds.indexOf(id):0} waiting={waitingCandidates.includes(id)} onActivate={()=>focusCandidate(id)} pick={pick} locate={locate} instance={instance} annotations={annotationsFor(interactions,currentPage,state)} showAnnotations={showAnnotations} inspectDomId={active?inspectDomId:""} locateNonce={locateNonce} proposal={active?proposal:undefined} runtimeState={state} navigationRequest={navigationCommands[id]} onIntent={next=>navigate(next,id)} onPrepared={(serial,allowed)=>prepared(id,serial,allowed)} onContext={context=>observeContext(id,context)} onSelect={(target,address,detail,annotationId)=>{if(!active){if(detail)pickedCandidate.current=id;focusCandidate(id);}select(target,address,detail,annotationId);}} onElements={active?observe:()=>{}} onEscape={exitTools} onError={error=>reportError(id+":"+currentPage,error)}/>;
        })}
        {pick&&<div className="pick-notice" role="status"><span>点击一个元素以附加到 Agent，选中后自动结束</span><button onClick={()=>setPick(false)}>取消点选</button></div>}
        {status&&!previewError&&<p className="studio-announcement" role="status">{status}</p>}
        {previewError&&<div className="preview-error" role="alert">{workbenchStatus}</div>}
      </section>
    </main>
    <aside hidden={!settingsOpen} id="studio-settings" className="settings-drawer" role="dialog" aria-modal="false" aria-labelledby="settings-title">
      <header className="inspector-header"><div><h2 id="settings-title">预览设置</h2><p>选择当前画面与体验环境</p></div><button ref={settingsClose} aria-label="关闭预览设置" onClick={closeSettings}>×</button></header>
      <div className="inspector-body">
        {data.requirements.length>1&&<label className="setting-field">需求<select aria-label="当前需求" value={manifest.id} onChange={e=>{location.href="/?id="+e.target.value;}}>{data.requirements.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>}
        <label className="setting-field">页面<select aria-label="页面" disabled={agent.busy||exporting} value={page} onChange={e=>navigate(e.target.value)}>{manifest.pages.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <label className="setting-field">场景<select aria-label="场景" value={!interacting&&scenario.page===page?scenario.id:""} onChange={e=>chooseScenario(e.target.value)}><option value="" disabled>当前交互状态</option>{data.scenarios.filter(s=>s.page===page).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label className="setting-field">方案<select aria-label="方案" value={candidate} onChange={e=>focusCandidate(e.target.value)}>{manifest.candidates.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label className="setting-field">视口<select aria-label="视口" value={viewportId} onChange={e=>setViewport(e.target.value)}>{manifest.viewports.map(v=><option key={v.id} value={v.id}>{v.title} · {v.width} × {v.height}</option>)}</select></label>
        <p className="drawer-help">抽屉覆盖画布；展开或收起不会改变产品视口和操作状态。</p>
      </div>
    </aside>
    {panel&&<aside id="studio-inspector" className="inspector-drawer" data-pick-hidden={pick} role="dialog" aria-modal="false" aria-labelledby="inspector-title" inert={pick}>
      <header className="inspector-header"><div><h2 id="inspector-title">{panelNames[panel]}</h2></div><button ref={closeButton} aria-label="关闭辅助面板" title="关闭 · Esc" onClick={closePanel}>×</button></header>
      <nav className="inspector-tabs" aria-label="切换辅助面板">{(["docs","agent","tools"] as Panel[]).map(view=><button key={view} aria-label={panelNames[view]} aria-pressed={panel===view} onClick={()=>showPanel(view)}><ToolIcon view={view}/>{({docs:"说明",agent:"Agent",tools:"工具"} as Record<Panel,string>)[view]}</button>)}</nav>
      <div className={"inspector-body "+(panel==="agent"?"agent-body":"")}>
        {panel==="docs"&&<div className="documentation" ref={docRef}>
          <InteractionReader interactions={interactions} page={page} pageTitle={manifest.pages.find(p=>p.id===page)!.title} state={runtimeState} elements={elements} selected={selectedAnnotation} overview={proposal?.documentation??data.documentation} foundation={manifest.foundationVersion} onLocate={locateAnnotation}/>
          {duplicates.length>0&&<p className="validation-warning" role="alert">重复的定位标识：{duplicates.join("、")}</p>}
          {missing.length>0&&elements.length>0&&<p className="validation-warning">当前画面尚未出现说明目标：{missing.map(a=>a.target).join("、")}。请在对应状态核对。</p>}
        </div>}
        {panel==="agent"&&<AgentPanel agent={agent} enabled={data.development} blocked={exporting||navigationPending} blockedReason={navigationPending?"请先完成或取消页面切换。":undefined} selection={selection} selectionStale={selectionStale} onPick={()=>{setSettingsOpen(false);setPick(true);}} onClear={()=>{setSelection(null);setSelectionStale(false);setSelected("");setInspectDomId("");setInstance("");}} onLevel={setInspectDomId}/>}
        {panel==="tools"&&<section className="workbench-tools" aria-label="画面工具">
          <div className="tool-group"><h3>体验与对照</h3><button aria-pressed={showAnnotations} onClick={()=>setShowAnnotations(v=>!v)}>{showAnnotations?"隐藏标注":"显示标注"}</button><button aria-label="重置当前场景" onClick={()=>chooseScenario(data.scenarios.find(s=>s.page===page&&s.id===scenario.id)?.id??data.scenarios.find(s=>s.page===page)!.id)}>重置当前场景</button><button aria-label="对比方案" aria-pressed={compare} disabled={!alternate} onClick={toggleCompare}>{compare?"退出方案对比":"对比方案"}</button></div>
          <div className="tool-group"><h3>交付</h3>{data.development?<button className="primary" disabled={exporting||agent.busy} onClick={exportDesign}>{exporting?"正在导出…":"导出离线 HTML"}</button>:<p className="muted">当前为离线体验，重新导出请使用本地工作台。</p>}</div>
          <p className="studio-status" role="status">{workbenchStatus}</p>
          {(duplicates.length>0||missing.length>0)&&<button onClick={event=>showPanel("docs",event.currentTarget)}>定位检查（{duplicates.length+missing.length}）</button>}
        </section>}
      </div>
    </aside>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
