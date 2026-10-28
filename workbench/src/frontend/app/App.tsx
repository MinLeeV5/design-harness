import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from "react";
import type {BundleData,PreviewContext,Annotation,DomSelection,AgentProposal} from "../../contracts/types";
import "./studio.css";
import {InteractionReader,annotationsFor} from "../features/interactions/InteractionReader";
import {useAgent} from "../features/agent/use-agent";
import {AgentPanel} from "../features/agent/AgentPanel";
import {PreviewFrame} from "../features/canvas/PreviewFrame";
import {useNavigation} from "../features/navigation/use-navigation";
import {captureFrame} from "../api/preview";
import {createWorkbenchClient} from "../api/workbench";
import {allValues} from "./values";
import {Select} from "../ui/Select";
import {Tooltip} from "@base-ui/react/tooltip";
import {ToolIcon,CanvasToolIcon,CloseIcon,WorkspaceStatusIcon,type Panel} from "./icons";
import harnessIcon from "../../../assets/harness-icon.png";
function WorkspaceStatus({development,proposal,fullAccess=false}:{development:boolean;proposal:boolean;fullAccess?:boolean}) {
  const [open,setOpen]=useState(false),descriptionId=useId();
  const status=proposal?{kind:"proposal" as const,title:fullAccess?"提案预览 · 完全访问":"提案预览 · 尚未写入",description:fullAccess?"本提案通过完全访问生成，源文件可能已被修改；放弃提案不会撤销这些修改。":"正在预览待确认的设计提案，源文件尚未更新。请回到原工作台接受或放弃修改。"}:development?{kind:"local" as const,title:"本地草稿",description:"正在预览本机设计资源。可在 Agent 中选择权限，提案工作区中的修改接受后写入。"}:{kind:"offline" as const,title:"离线预览",description:"当前为导出的独立 HTML，可体验页面、阅读说明和点选元素。聊天、生成及本地写回需在本地工作台使用。"};
  return <Tooltip.Root open={open} onOpenChange={(next,details)=>{if(details.reason==="escape-key")details.event.preventDefault();setOpen(next);}}>
    <Tooltip.Trigger type="button" className="workspace-status" data-kind={status.kind} aria-label={status.title} aria-describedby={open?descriptionId:undefined} delay={180} closeDelay={100} closeOnClick={false} onClick={()=>setOpen(value=>!value)}><WorkspaceStatusIcon kind={status.kind}/></Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Positioner className="workspace-status-positioner" side="bottom" sideOffset={8} align="start" collisionPadding={10}><Tooltip.Popup id={descriptionId} role="tooltip" className="workspace-status-popup" data-workbench-status-popup=""><strong>{status.title}</strong><p>{status.description}</p></Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
export function App({data:initialData}:{data:BundleData}) {
  const [data,setData]=useState(initialData);
  const initial=useMemo(()=>new URLSearchParams(location.hash.slice(1)),[]);
  const api=useMemo(()=>createWorkbenchClient(data.token),[data.token]);
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
  const settingsTrigger=useRef<HTMLButtonElement>(null),settingsClose=useRef<HTMLButtonElement>(null);
  const panelTriggers=useRef<Partial<Record<Panel,HTMLButtonElement|null>>>({});
  const values=useMemo(()=>allValues(data),[data]);
  const [previewErrors,setPreviewErrors]=useState<Record<string,string>>({});
  const scope=candidate+":"+page;
  const revisionRef=useRef(data.revision),pollGeneration=useRef(0);
  const [exporting,setExporting]=useState(false);
  const exportingRef=useRef(false);
  const refreshTask=useRef<Promise<void>|null>(null);
  function refreshWorkspace(){
    if(refreshTask.current)return refreshTask.current;
    const task=api.workspace(manifest.id).then(next=>{
      const current=workspaceSelection.current,nextPage=next.manifest.pages.some(p=>p.id===current.page)?current.page:next.manifest.pages[0].id;
      const nextScenario=next.scenarios.find(s=>s.id===current.scenarioId)??next.scenarios.find(s=>s.page===nextPage)??next.scenarios[0];
      const nextViewport=next.manifest.viewports.find(v=>v.id===current.viewportId)??next.manifest.viewports[0];
      const candidates=next.manifest.candidates.map(c=>c.id),nextCandidate=candidates.includes(current.candidate)?current.candidate:candidates[0];
      const comparison=[...current.comparisonIds.filter(id=>candidates.includes(id)),...candidates.filter(id=>!current.comparisonIds.includes(id))].slice(0,2);
      const retained=Object.fromEntries(Object.entries(current.contexts).filter(([id,value])=>next.specs[id+":"+value.page]));
      revisionRef.current=next.revision;setData(next);setPage(nextPage);setScenario(nextScenario.id);setViewport(nextViewport.id);setCandidate(nextCandidate);setComparisonIds(comparison);setCompare(enabled=>enabled&&candidates.length>1);setContexts(retained);cancelNavigation();
    }).finally(()=>{refreshTask.current=null;});
    refreshTask.current=task;return task;
  }
  const [elements,setElements]=useState<string[]>([]),[duplicates,setDuplicates]=useState<string[]>([]);
  const [reset,setReset]=useState(0),[instance,setInstance]=useState("");
  const [contexts,setContexts]=useState<Record<string,PreviewContext>>({}),[selectedAnnotation,setSelectedAnnotation]=useState("");
  const contextInitial=useRef<Record<string,string>>({});
  const workspaceSelection=useRef({page,scenarioId,viewportId,contexts,candidate,comparisonIds});workspaceSelection.current={page,scenarioId,viewportId,contexts,candidate,comparisonIds};
  const agentBusyRef=useRef(false);
  const {navigationCommands,waitingCandidates,navigationPending,navigate,prepared,cancelNavigation}=useNavigation({candidate,compare,comparisonIds,busy:()=>agentBusyRef.current,onStatus:setStatus});
  const [interacting,setInteracting]=useState(false);
  const docRef=useRef<HTMLDivElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  function showPanel(view:Panel) {
    if(view==="docs")setShowAnnotations(true);
    if(matchMedia("(max-width:700px)").matches)setSettingsOpen(false);
    setPick(false);
    setPanel(view);
  }
  function closePanel() {
    const trigger=panel?panelTriggers.current[panel]:null;
    setPanel(null);setPick(false);
    requestAnimationFrame(()=>{if(trigger?.isConnected)trigger.focus({preventScroll:true});});
  }
  useEffect(()=>{if(panel&&!pick)closeButton.current?.focus({preventScroll:true});},[panel,pick]);
  useEffect(()=>{if(settingsOpen)settingsClose.current?.focus({preventScroll:true});},[settingsOpen]);
  useEffect(()=>{const viewport=matchMedia("(max-width:700px)");const adapt=()=>{if(viewport.matches&&panel)setSettingsOpen(false);};adapt();viewport.addEventListener("change",adapt);return()=>viewport.removeEventListener("change",adapt);},[panel]);
  function closeSettings(){setSettingsOpen(false);requestAnimationFrame(()=>settingsTrigger.current?.focus({preventScroll:true}));}
  function exitTools(){if(pick){setPick(false);return;}if(panel){closePanel();return;}if(settingsOpen)closeSettings();}
  useLayoutEffect(()=>{if(annotationFocus&&panel==="docs")closeButton.current?.focus({preventScroll:true});},[annotationFocus,panel]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(!event.defaultPrevented&&event.key==="Escape" && (panel||pick||settingsOpen)&&!event.composedPath().some(node=>node instanceof HTMLElement&&node.hasAttribute("data-workbench-select-popup"))) {event.preventDefault();exitTools();}
    };
    window.addEventListener("keydown",escape);
    return()=>window.removeEventListener("keydown",escape);
  },[panel,pick,settingsOpen]);
  const scenario=data.scenarios.find(s=>s.id===scenarioId)??data.scenarios.find(s=>s.page===page)??data.scenarios[0];
  const viewport=manifest.viewports.find(v=>v.id===viewportId)??manifest.viewports[0];
  const alternate=manifest.candidates.find(c=>c.id!==candidate);
  const agent=useAgent({id:manifest.id,candidate,page,scenario:scenario.id,reset,selection,revision:()=>revisionRef.current,token:data.token,enabled:data.development,active:panel==="agent",blocked:exporting||navigationPending,capture:()=>{const frame=document.querySelector<HTMLIFrameElement>('.frame-column[data-candidate="'+candidate+'"] iframe');if(!frame)return Promise.reject(new Error("当前画面尚未加载"));return captureFrame(frame,page,contexts[candidate]?.state??{...data.specs[candidate+":"+page].state,...scenario.state});},onProposal:value=>{if(proposalDocument.current!==value?.html){if(selection)setSelectionStale(true);setInspectDomId("");}proposalDocument.current=value?.html;setProposal(value);setPick(false);},onAccepted:refreshWorkspace});
  agentBusyRef.current=agent.submitting;
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
        const revision=await api.revision(manifest.id);
        if(revision!==undefined&&!cancelled&&generation===pollGeneration.current&&!exportingRef.current&&!agentBusyRef.current&&revision!==revisionRef.current)await refreshWorkspace();
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
    const leave=(event:BeforeUnloadEvent)=>{if(exportingRef.current){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);
  },[]);
  const select=(id:string,address:string,detail?:DomSelection,annotationId?:string)=>{setPick(false);setSelected(id);setInstance(address);setSelection(detail??null);setSelectionStale(false);setInspectDomId(detail?.domId??"");setSelectedAnnotation(annotationId??interactions.find(a=>(a.page===page||a.page==="*")&&a.target===id)?.id??"");if(annotationId)setLocateNonce(v=>v+1);showPanel(annotationId?"docs":"agent");if(annotationId)setAnnotationFocus(value=>value+1);};
  function locateAnnotation(a:Annotation){setSelectedAnnotation(a.id);setSelected(a.target);setInstance("");setSelection(null);setInspectDomId("");setLocateNonce(v=>v+1);}
  useEffect(()=>{if(pickedCandidate.current===candidate){pickedCandidate.current="";return;}setSelection(null);setSelectionStale(false);setInspectDomId("");},[page,scenarioId,candidate,reset]);
  const observe=(ids:string[],dupes:string[])=>{setElements(ids);setDuplicates(dupes);};
  function download(name:string,content:string|Blob) {
    const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type:"application/json"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportDesign() {
    if(exportingRef.current||agentBusyRef.current)return;
    exportingRef.current=true;setExporting(true);pollGeneration.current++;setStatus("正在生成离线 HTML…");
    try {
      download(manifest.id+".html",await api.exportHtml(manifest.id));setStatus("已下载离线 HTML");
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
      <div className="requirement-title"><h1 title={manifest.title}>{manifest.title}</h1><WorkspaceStatus development={data.development} proposal={Boolean(data.proposal)} fullAccess={data.proposalPermission==="full-access"}/></div>
      <nav className="preview-context" aria-label="页面与场景">
        <Select label="页面" variant="toolbar" className="context-choice" disabled={agent.submitting||exporting} value={page} onValueChange={navigate} options={manifest.pages.map(p=>({value:p.id,label:p.title}))}/>
        <span className="context-separator" aria-hidden="true">/</span>
        <Select label="场景" variant="toolbar" className="context-choice context-scenario" value={!interacting&&scenario.page===page?scenario.id:""} onValueChange={chooseScenario} options={[{value:"",label:"当前交互状态",disabled:true,description:"选择预设场景以重新开始体验"},...data.scenarios.filter(s=>s.page===page).map(s=>({value:s.id,label:s.title}))]}/>
      </nav>
      <nav className="header-panels" aria-label="辅助面板">
        {(["docs","agent","tools"] as Panel[]).map(view=><button key={view} ref={element=>{panelTriggers.current[view]=element;}} className="drawer-trigger" aria-label={panelNames[view]} title={panelNames[view]} aria-expanded={panel===view} aria-controls="studio-inspector" onClick={()=>panel===view?closePanel():showPanel(view)}><ToolIcon view={view}/><span>{view==="docs"?"说明":panelNames[view]}</span>{view==="agent"&&(agent.waiting?<span className="loading-spinner" aria-label="Agent 正在处理"/>:agent.job?.state==="ready"&&<span className="unsaved-dot" aria-hidden="true"/>)}</button>)}
      </nav>
    </header>
    <main className="studio-main">
      <section className={"preview-stage "+(compare?"comparing":"")} aria-label="设计预览">
        {manifest.candidates.map(item=>{
          const id=item.id,active=id===candidate,currentPage=contexts[id]?.page??scenario.page,state=contexts[id]?.state??{...data.specs[id+":"+currentPage].state,...scenario.state};
          return <PreviewFrame data={data} key={id+":"+scenario.id+":"+reset+":"+data.revision} candidate={id} page={currentPage} scenario={scenario} viewport={viewport} values={values[id+":"+currentPage]} hidden={compare?!comparisonIds.includes(id):!active} active={active} order={compare?comparisonIds.indexOf(id):0} waiting={waitingCandidates.includes(id)} onActivate={()=>focusCandidate(id)} pick={pick} locate={locate} instance={instance} annotations={annotationsFor(interactions,currentPage,state)} showAnnotations={showAnnotations} inspectDomId={active?inspectDomId:""} locateNonce={locateNonce} proposal={active?proposal:undefined} runtimeState={state} navigationRequest={navigationCommands[id]} onIntent={next=>navigate(next,id)} onPrepared={(serial,allowed)=>prepared(id,serial,allowed)} onContext={context=>observeContext(id,context)} onSelect={(target,address,detail,annotationId)=>{if(!active){if(detail)pickedCandidate.current=id;focusCandidate(id);}select(target,address,detail,annotationId);}} onElements={active?observe:()=>{}} onEscape={exitTools} onError={error=>reportError(id+":"+currentPage,error)}/>;
        })}
        {pick&&<div className="pick-notice" role="status"><span>点击一个元素以附加到 Agent，选中后自动结束</span><button onClick={()=>setPick(false)}>取消点选</button></div>}
        {status&&!previewError&&<p className="studio-announcement" role="status">{status}</p>}
        {previewError&&<div className="preview-error" role="alert">{workbenchStatus}</div>}
      </section>
    <aside hidden={!settingsOpen} id="studio-settings" className="settings-drawer" role="dialog" aria-modal="false" aria-labelledby="settings-title">
      <header className="inspector-header"><div><h2 id="settings-title">预览设置</h2><p>选择当前画面与体验环境</p></div><button ref={settingsClose} aria-label="关闭预览设置" onClick={closeSettings}><CloseIcon/></button></header>
      <div className="inspector-body">
        {data.requirements.length>1&&<div className="setting-field"><span>需求</span><Select label="当前需求" value={manifest.id} onValueChange={id=>{location.href="/?id="+encodeURIComponent(id);}} options={data.requirements.map(r=>({value:r.id,label:r.title}))}/></div>}
        <div className="setting-field"><span>方案</span><Select label="方案" value={candidate} onValueChange={focusCandidate} options={manifest.candidates.map(c=>({value:c.id,label:c.title}))}/></div>
        <div className="setting-field"><span>视口</span><Select label="视口" value={viewportId} onValueChange={setViewport} options={manifest.viewports.map(v=>({value:v.id,label:v.title,description:v.width+" × "+v.height}))}/></div>
        <p className="drawer-help">抽屉覆盖画布；展开或收起不会改变产品视口和操作状态。</p>
      </div>
    </aside>
    {panel&&<aside id="studio-inspector" className="inspector-drawer" data-pick-hidden={pick} role="dialog" aria-modal="false" aria-labelledby="inspector-title" inert={pick}>
      <header className="inspector-header"><div><h2 id="inspector-title">{panelNames[panel]}</h2></div><button ref={closeButton} aria-label="关闭辅助面板" title="关闭 · Esc" onClick={closePanel}><CloseIcon/></button></header>
      <div className={"inspector-body "+(panel==="agent"?"agent-body":"")}>
        {panel==="docs"&&<div className="documentation" ref={docRef}>
          <InteractionReader interactions={interactions} page={page} pageTitle={manifest.pages.find(p=>p.id===page)!.title} state={runtimeState} elements={elements} selected={selectedAnnotation} overview={proposal?.documentation??data.documentation} foundation={manifest.foundationVersion} onLocate={locateAnnotation}/>
          {duplicates.length>0&&<p className="validation-warning" role="alert">重复的定位标识：{duplicates.join("、")}</p>}
          {missing.length>0&&elements.length>0&&<p className="validation-warning">当前画面尚未出现说明目标：{missing.map(a=>a.target).join("、")}。请在对应状态核对。</p>}
        </div>}
        {panel==="agent"&&<AgentPanel agent={agent} enabled={data.development} blocked={exporting||navigationPending} blockedReason={navigationPending?"请先完成或取消页面切换。":undefined} selection={selection} selectionStale={selectionStale} onPick={()=>{setSettingsOpen(false);setPick(true);}} onClear={()=>{setSelection(null);setSelectionStale(false);setSelected("");setInspectDomId("");setInstance("");}} onLevel={setInspectDomId}/>}
        {panel==="tools"&&<section className="workbench-tools" aria-label="画面工具">
          <div className="tool-grid">
            <button className="tool-card" aria-pressed={showAnnotations} onClick={()=>setShowAnnotations(v=>!v)}><CanvasToolIcon tool="annotations"/><span>{showAnnotations?"隐藏标注":"显示标注"}</span></button>
            <button className="tool-card" aria-label="重置当前场景" onClick={()=>chooseScenario(data.scenarios.find(s=>s.page===page&&s.id===scenario.id)?.id??data.scenarios.find(s=>s.page===page)!.id)}><CanvasToolIcon tool="reset"/><span>重置当前场景</span></button>
            <button className="tool-card" aria-label="对比方案" aria-pressed={compare} disabled={!alternate} onClick={toggleCompare}><CanvasToolIcon tool="compare"/><span>{compare?"退出方案对比":"对比方案"}</span></button>
            <button className="tool-card" disabled={!data.development||exporting||agent.busy} aria-describedby={!data.development?"offline-export-help":undefined} onClick={exportDesign}><CanvasToolIcon tool="export"/><span>{exporting?"正在导出…":"导出离线 HTML"}</span></button>
          </div>
          {!data.development&&<p id="offline-export-help" className="muted">当前为离线体验，重新导出请使用本地工作台。</p>}
          <p className="studio-status" role="status">{workbenchStatus}</p>
          {(duplicates.length>0||missing.length>0)&&<button onClick={()=>showPanel("docs")}>定位检查（{duplicates.length+missing.length}）</button>}
        </section>}
      </div>
    </aside>}
    </main>
  </div>;
}
