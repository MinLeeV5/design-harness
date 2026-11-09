import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from "react";
import type {BundleData,PreviewContext,Annotation,DomSelection,AgentProposal,ReviewThread} from "../../contracts/types";
import "./studio.css";
import {InteractionReader,annotationsFor} from "../features/interactions/InteractionReader";
import {useAgent} from "../features/agent/use-agent";
import {useReviews} from "../features/reviews/use-reviews";
import {ReviewPanel} from "../features/reviews/ReviewPanel";
import "../features/reviews/reviews.css";
import {reviewSourceLabels} from "../../contracts/reviews.mjs";
import {AgentPanel} from "../features/agent/AgentPanel";
import {ExplorationCanvas,type ExplorationView} from "../features/agent/ExplorationCanvas";
import {AgentSessionControls,ProviderStatus,ApprovalIndicator} from "../features/agent/AgentHeader";
import {PreviewFrame} from "../features/canvas/PreviewFrame";
import {useNavigation} from "../features/navigation/use-navigation";
import {captureFrame} from "../api/preview";
import {createWorkbenchClient} from "../api/workbench";
import {allValues} from "./values";
import {Select} from "../ui/Select";
import {Tooltip} from "@base-ui/react/tooltip";
import {ToolIcon,CanvasToolIcon,CloseIcon,WorkspaceStatusIcon,type Panel} from "./icons";
import harnessIcon from "../../../assets/harness-icon.png";
function WorkspaceStatus({development,proposal,fullAccess=false,sourceState}:{development:boolean;proposal:boolean;fullAccess?:boolean;sourceState?:string}) {
  const [open,setOpen]=useState(false),descriptionId=useId();
  const status=proposal?{kind:"proposal" as const,title:sourceState&&sourceState!=="ready"?(reviewSourceLabels[sourceState]??"提案来源状态待核实"):fullAccess?"提案预览 · 完全访问":"提案预览 · 尚未写入",description:sourceState&&sourceState!=="ready"?"当前窗口保留提案评审时的画面，批阅与截图仍可查看。请回到本地工作台在最新设计上继续批阅。":fullAccess?"本提案通过完全访问生成，源文件可能已被修改；放弃提案不会撤销这些修改。":"正在预览待确认的设计提案，源文件尚未更新。请回到原工作台接受或放弃修改。"}:development?{kind:"local" as const,title:"本地草稿",description:"正在预览本机设计资源。可在 Agent 中选择权限，提案工作区中的修改接受后写入。"}:{kind:"offline" as const,title:"离线预览",description:"当前为导出的独立 HTML，可体验页面、阅读说明和点选元素。聊天、生成及本地写回需在本地工作台使用。"};
  return <Tooltip.Root open={open} onOpenChange={(next,details)=>{if(details.reason==="escape-key")details.event.preventDefault();setOpen(next);}}>
    <Tooltip.Trigger type="button" className="workspace-status" data-kind={status.kind} aria-label={status.title} aria-describedby={open?descriptionId:undefined} delay={180} closeDelay={100} closeOnClick={false} onClick={()=>setOpen(value=>!value)}><WorkspaceStatusIcon kind={status.kind}/></Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Positioner className="workspace-status-positioner" side="bottom" sideOffset={8} align="start" collisionBoundary={document.documentElement} collisionPadding={10}><Tooltip.Popup id={descriptionId} role="tooltip" className="workspace-status-popup" data-workbench-status-popup=""><strong>{status.title}</strong><p>{status.description}</p></Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
export function App({data:initialData}:{data:BundleData}) {
  const [data,setData]=useState(initialData);
  const [explorationView,setExplorationView]=useState<ExplorationView|null>(null);
  const observeExploration=useCallback((view:ExplorationView|null)=>setExplorationView(view),[]);
  const initial=useMemo(()=>new URLSearchParams(location.hash.slice(1)),[]);
  const reviewWindowId=useMemo(()=>crypto.randomUUID(),[]);
  const api=useMemo(()=>createWorkbenchClient(data.token),[data.token]);
  const manifest=data.manifest;
  const [page,setPage]=useState(manifest.pages.find(p=>p.id===initial.get("page"))?.id??manifest.pages[0].id);
  const [scenarioId,setScenario]=useState(data.scenarios.find(s=>s.id===initial.get("scenario")&&s.page===page)?.id??data.scenarios.find(s=>s.page===page)!.id);
  const [candidate,setCandidate]=useState(data.reviewSource?.candidate??manifest.candidates.find(c=>c.id===initial.get("candidate"))?.id??manifest.candidates[0].id);
  const [viewportId,setViewport]=useState(manifest.viewports.find(v=>v.id===initial.get("viewport"))?.id??manifest.viewports[0].id);
  const [compare,setCompare]=useState(false),[comparisonIds,setComparisonIds]=useState<string[]>(manifest.candidates.slice(0,2).map(c=>c.id)),[pick,setPick]=useState(false),[selected,setSelected]=useState("");
  const [showAnnotations,setShowAnnotations]=useState(false),[selection,setSelection]=useState<DomSelection|null>(null),[inspectDomId,setInspectDomId]=useState(""),[locateNonce,setLocateNonce]=useState(0);
  const [proposal,setProposal]=useState<AgentProposal|undefined>(),[annotationFocus,setAnnotationFocus]=useState(0);
  const reviews=useReviews({id:manifest.id,candidate,page,enabled:Boolean(data.token),token:data.token,revision:data.revision,proposalId:proposal?.jobId??data.reviewSource?.proposalId});
  const reviewOriginState=data.reviewSource?(reviews.sourceState??reviews.threads.find(t=>t.source.proposalId===data.reviewSource!.proposalId)?.source.state??data.reviewSource.state):undefined;
  const interactions=proposal?.interactions??data.interactions;
  const pickedCandidate=useRef("");
  const [selectionStale,setSelectionStale]=useState(false);const proposalDocument=useRef<string|undefined>(undefined);
  const [panel,setPanel]=useState<Panel|null>(null),[settingsOpen,setSettingsOpen]=useState(false),[status,setStatus]=useState("");
  const [reviewDraftLink,setReviewDraftLink]=useState("");
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
    reviews.setPicking(false);setPanel(view);
  }
  function closePanel() {
    const trigger=panel?panelTriggers.current[panel]:null;
    setPanel(null);setPick(false);reviews.setPicking(false);
    requestAnimationFrame(()=>{if(trigger?.isConnected)trigger.focus({preventScroll:true});});
  }
  useEffect(()=>{if(panel&&!pick&&!reviews.picking&&!reviews.pending)closeButton.current?.focus({preventScroll:true});},[panel,pick,reviews.picking]);
  useEffect(()=>{if(settingsOpen)settingsClose.current?.focus({preventScroll:true});},[settingsOpen]);
  useEffect(()=>{const viewport=matchMedia("(max-width:700px)");const adapt=()=>{if(viewport.matches&&panel)setSettingsOpen(false);};adapt();viewport.addEventListener("change",adapt);return()=>viewport.removeEventListener("change",adapt);},[panel]);
  function closeSettings(){setSettingsOpen(false);requestAnimationFrame(()=>settingsTrigger.current?.focus({preventScroll:true}));}
  function exitTools(){if(reviews.picking){reviews.setPicking(false);return;}if(pick){setPick(false);return;}if(panel){closePanel();return;}if(settingsOpen)closeSettings();}
  useLayoutEffect(()=>{if(annotationFocus&&panel==="docs")closeButton.current?.focus({preventScroll:true});},[annotationFocus,panel]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(!event.defaultPrevented&&event.key==="Escape" && (panel||pick||reviews.picking||settingsOpen)&&!event.composedPath().some(node=>node instanceof HTMLElement&&node.hasAttribute("data-workbench-select-popup"))) {event.preventDefault();exitTools();}
    };
    window.addEventListener("keydown",escape);
    return()=>window.removeEventListener("keydown",escape);
  },[panel,pick,reviews.picking,settingsOpen]);
  const scenario=data.scenarios.find(s=>s.id===scenarioId)??data.scenarios.find(s=>s.page===page)??data.scenarios[0];
  const viewport=manifest.viewports.find(v=>v.id===viewportId)??manifest.viewports[0];
  const alternate=manifest.candidates.find(c=>c.id!==candidate);
  const agent=useAgent({id:manifest.id,candidate,page,pages:manifest.pages,scenario:scenario.id,reset,selection,revision:()=>revisionRef.current,token:data.token,enabled:data.development,active:panel==="agent",blocked:exporting||navigationPending,capture:()=>{if(explorationActive&&explorationView&&explorationView.group===agent.job?.exploration?.id)return explorationView.capture();const frame=document.querySelector<HTMLIFrameElement>('.preview-stage>.frame-column[data-candidate="'+candidate+'"] iframe');if(!frame)return Promise.reject(new Error("当前画面尚未加载"));return captureFrame(frame,page,contexts[candidate]?.state??{...data.specs[candidate+":"+page].state,...scenario.state});},onProposal:value=>{if(proposalDocument.current!==value?.html){if(selection)setSelectionStale(true);setInspectDomId("");setPick(false);}proposalDocument.current=value?.html;setProposal(value);},onAccepted:refreshWorkspace});
  const explorationActive=Boolean(agent.job?.exploration&&!["accepted","discarded","cancelled","failed","superseded"].includes(agent.job.state)&&(agent.job.exploration.options.length||agent.job.exploration.baseProposal));
  const reviewPickDisabledReason=compare||explorationActive?"方案对比期间暂不支持新增批阅":undefined;
  useEffect(()=>{if(reviewPickDisabledReason)reviews.setPicking(false);},[reviewPickDisabledReason]);
  const currentExploration=explorationActive&&explorationView?.group===agent.job?.exploration?.id?explorationView:null;
  const visibleManifest=currentExploration?.data.manifest??manifest,visiblePage=currentExploration?.context.page??page,visibleScenario=currentExploration?.scenario??scenario,visibleScenarios=currentExploration?.data.scenarios??data.scenarios;
  const visibleInteractions=currentExploration?.data.interactions??interactions,visibleInteracting=currentExploration?.interacting??interacting,visibleElements=currentExploration?.elements??elements;
  function navigateVisible(next:string){if(currentExploration)currentExploration.navigate(next);else navigate(next);}
  function scenarioVisible(next:string){if(currentExploration)currentExploration.chooseScenario(next);else chooseScenario(next);}
  agentBusyRef.current=agent.submitting;
  const reviewDraftTarget=useRef({candidate,attach:agent.addReviewsToSession});reviewDraftTarget.current={candidate,attach:agent.addReviewsToSession};
  const importedReviews=useRef(false);
  useEffect(()=>{const ids=initial.get("reviewRefs")?.split(",")??[];if(!data.development||importedReviews.current||!ids.length||!reviews.threads.length)return;const items=reviews.threads.filter(t=>ids.includes(t.id));if(items.length){importedReviews.current=true;void(async()=>{const target=initial.get("reviewSession");if(target&&!await agent.addReviewsToSession(items,target)){const created=await agent.newSession();if(!created||!await agent.addReviewsToSession(items,created)){reviews.setError("未能建立批阅草稿，评语仍保留，请重新添加");showPanel("reviews");return;}setStatus("原会话已不可用，已为批阅新建会话草稿");}else if(!target)agent.addReviews(items);showPanel("agent");})();}},[data.development,reviews.threads]);
  useEffect(()=>{if(!data.development||!data.token)return;const channel=new BroadcastChannel("dh-review-"+data.token);let live=true;channel.onmessage=async event=>{const message=event.data;if(message?.type!=="add-reviews"||message.targetWindow!==reviewWindowId||typeof message.targetSession!=="string"||message.id!==manifest.id||message.candidate!==reviewDraftTarget.current.candidate||!Array.isArray(message.refs))return;try{const snapshot=await api.reviews(manifest.id,message.candidate);if(!live||message.candidate!==reviewDraftTarget.current.candidate)return;const items=snapshot.threads.filter(t=>message.refs.includes(t.id));if(!items.length)return;if(!await reviewDraftTarget.current.attach(items,message.targetSession))return;showPanel("agent");channel.postMessage({type:"reviews-added",request:message.request});}catch{/* The proposal view can open the local workbench as fallback. */}};return()=>{live=false;channel.close();};},[data.development,data.token,manifest.id,api]);
  function addReviewDraft(items:ReviewThread[]){
    if(data.development){agent.addReviews(items);showPanel("agent");return;}
    const channel=new BroadcastChannel("dh-review-"+data.token),request=crypto.randomUUID();let delivered=false;
    const timer=setTimeout(()=>{channel.close();if(!delivered){const url=new URL("/",location.origin);url.searchParams.set("id",manifest.id);url.hash=new URLSearchParams({candidate,reviewSession:data.reviewReturn?.sessionId??"",reviewRefs:items.map(t=>t.id).join(",")}).toString();setReviewDraftLink(url.toString());window.open(url.toString(),"_blank","noopener,noreferrer");setStatus("请在本地工作台查看批阅草稿");}},2000);
    channel.onmessage=event=>{if(event.data?.type==="reviews-added"&&event.data.request===request){delivered=true;clearTimeout(timer);channel.close();setReviewDraftLink("");setStatus("已加入原工作台的 Agent 草稿");}};
    channel.postMessage({type:"add-reviews",request,targetWindow:data.reviewReturn?.windowId,targetSession:data.reviewReturn?.sessionId,id:manifest.id,candidate,refs:items.map(t=>t.id)});
  }
  function beginReview(){if(reviewPickDisabledReason)return;setSettingsOpen(false);setPick(false);setPanel("reviews");reviews.setPicking(true);}
  function locateReview(thread:ReviewThread){reviews.focus(thread.id);if(!manifest.pages.some(p=>p.id===thread.page)){reviews.setError("原页面已不在当前设计中，可查看批阅时的截图");return;}setLocateNonce(value=>value+1);if(thread.page!==page)navigate(thread.page);}
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

  const runtimeState=currentExploration?.context.state??contexts[candidate]?.state??{...data.specs[candidate+":"+page].state,...scenario.state};
  const annotations=annotationsFor(visibleInteractions,visiblePage,runtimeState);
  const missing=annotations.filter(a=>!visibleElements.includes(a.target));
  function observeContext(id:string,context:PreviewContext){
    const signature=JSON.stringify(context);if(!contextInitial.current[id])contextInitial.current[id]=signature;
    setContexts(old=>JSON.stringify(old[id])===signature?old:{...old,[id]:context});
    if(id===candidate){if(context.page!==page){setPage(context.page);setSelected("");setSelectedAnnotation("");setInstance("");setElements([]);}if(signature!==contextInitial.current[id])setInteracting(true);}
  }
  function focusCandidate(id:string){
    if(explorationActive){setStatus("请先结束本轮探索，再切换正式方案；探索历史会保留");return;}
    if(id!==candidate&&(data.reviewSource||reviews.pending||reviews.saving)){setStatus("请先保存或取消当前批阅");return;}
    if(compare&&!comparisonIds.includes(id)){const ids=comparisonIds.map(old=>old===candidate?id:old);setComparisonIds(ids);navigate(page,id,ids);}
    setCandidate(id);setPage(contexts[id]?.page??scenario.page);setLocateNonce(value=>value+1);setElements([]);setSelection(null);setInspectDomId("");
  }
  function toggleCompare(){cancelNavigation();if(!compare){const ids=comparisonIds.includes(candidate)?comparisonIds:[candidate,manifest.candidates.find(c=>c.id!==candidate)!.id];setComparisonIds(ids);setCompare(true);navigate(page,candidate,ids);}else setCompare(false);}
  function chooseScenario(next:string){const preset=data.scenarios.find(s=>s.id===next)!;setScenario(next);setPage(preset.page);setReset(value=>value+1);setContexts({});contextInitial.current={};setInteracting(false);cancelNavigation();setSelected("");setSelectedAnnotation("");setInstance("");setElements([]);}

  const panelNames:Record<Panel,string>={docs:"交互说明",agent:"Agent",tools:"工具",reviews:"评审"};
  const locate=panel||pick ? selected : "";
  const workbenchStatus=previewError?"预览失败："+previewError:status||(agent.job?.state==="ready"?"有待确认的生成预览，请在 Agent 中继续调整":"直接操作页面，体验当前流程");
  return <div className="studio-shell" data-picking={pick||reviews.picking}>
    <header className="studio-header">
      <button ref={settingsTrigger} className="drawer-trigger" aria-label="预览设置" title="预览设置" aria-expanded={settingsOpen} aria-controls="studio-settings" onClick={()=>{if(settingsOpen)closeSettings();else{if(matchMedia("(max-width:700px)").matches)setPanel(null);setSettingsOpen(true);setPick(false);}}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1M5.5 12h1"/></svg><span>预览</span></button>
      <a className="studio-brand" href="#" onClick={event=>event.preventDefault()}><img className="brand-mark" src={harnessIcon} alt=""/><span>Design Harness</span></a>
      <div className="requirement-title"><h1 title={manifest.title}>{manifest.title}</h1><WorkspaceStatus development={data.development} proposal={Boolean(data.proposal)} fullAccess={data.proposalPermission==="full-access"} sourceState={reviewOriginState}/></div>
      <nav className="preview-context" aria-label="页面与场景">
        <Select label="页面" variant="toolbar" className="context-choice" disabled={agent.submitting||exporting||reviews.saving} value={visiblePage} onValueChange={navigateVisible} options={visibleManifest.pages.map(p=>({value:p.id,label:p.title}))}/>
        <span className="context-separator" aria-hidden="true">/</span>
        <Select label="场景" variant="toolbar" className="context-choice context-scenario" value={!visibleInteracting&&visibleScenario.page===visiblePage?visibleScenario.id:""} onValueChange={scenarioVisible} options={[{value:"",label:"当前交互状态",disabled:true,description:"选择预设场景以重新开始体验"},...visibleScenarios.filter(s=>s.page===visiblePage).map(s=>({value:s.id,label:s.title}))]}/>
      </nav>
      <nav className="header-panels" aria-label="辅助面板">
        {(["docs",...(data.token?["reviews"]:[]),"agent","tools"] as Panel[]).map(view=><button key={view} ref={element=>{panelTriggers.current[view]=element;}} className="drawer-trigger" aria-label={panelNames[view]} title={view==="agent"&&agent.approvalSessions.length?"Agent · "+agent.approvalSessions.length+" 个会话等待审批":panelNames[view]} aria-expanded={panel===view} aria-controls="studio-inspector" onClick={()=>panel===view?closePanel():showPanel(view)}><ToolIcon view={view}/><span>{view==="docs"?"说明":panelNames[view]}</span>{view==="agent"&&(agent.approvalSessions.length?<ApprovalIndicator count={agent.approvalSessions.length}/>:agent.waiting?<span className="loading-spinner" aria-label="Agent 正在处理"/>:agent.job?.state==="ready"&&<span className="unsaved-dot" aria-hidden="true"/>)}</button>)}
      </nav>
    </header>
    <main className="studio-main">
      <section className={"preview-stage "+(compare&&!explorationActive?"comparing":"")+(explorationActive?" exploring":"")} aria-label="设计预览">
        {manifest.candidates.map(item=>{
          const id=item.id,active=id===candidate,currentPage=contexts[id]?.page??scenario.page,state=contexts[id]?.state??{...data.specs[id+":"+currentPage].state,...scenario.state};
          return <PreviewFrame data={data} key={id+":"+scenario.id+":"+reset+":"+data.revision} candidate={id} page={currentPage} scenario={scenario} viewport={viewport} values={values[id+":"+currentPage]} hidden={explorationActive||(compare?!comparisonIds.includes(id):!active)} active={active} order={compare?comparisonIds.indexOf(id):0} waiting={waitingCandidates.includes(id)} onActivate={()=>focusCandidate(id)} pick={pick} locate={locate} instance={instance} annotations={annotationsFor(interactions,currentPage,state)} showAnnotations={showAnnotations} inspectDomId={active?inspectDomId:""} locateNonce={locateNonce} proposal={active?proposal:undefined} runtimeState={state} navigationRequest={navigationCommands[id]} onIntent={next=>navigate(next,id)} onPrepared={(serial,allowed)=>prepared(id,serial,allowed)} onContext={context=>observeContext(id,context)} onSelect={(target,address,detail,annotationId)=>{if(!active){if(detail)pickedCandidate.current=id;focusCandidate(id);}select(target,address,detail,annotationId);}} onElements={active?observe:()=>{}} onEscape={exitTools} onError={error=>reportError(id+":"+currentPage,error)} review={data.token?{picking:reviews.picking,threads:active?reviews.threads:[],show:panel==="reviews",locate:reviews.focused,onPoint:(anchor,capture)=>{reviews.point(anchor,capture);setPanel("reviews");},onFocus:reviewId=>{reviews.focus(reviewId);showPanel("reviews");},onLocations:states=>{if(active)reviews.setLocations(old=>JSON.stringify(old)===JSON.stringify(states)?old:states);},onError:reviews.setError}:undefined}/>;
        })}
        {explorationActive&&<ExplorationCanvas key={agent.job!.exploration!.id} agent={agent} data={data} viewport={viewport} pick={pick} showAnnotations={showAnnotations} locate={locate} inspectDomId={inspectDomId} locateNonce={locateNonce} onView={observeExploration} onReference={reference=>{agent.addOptionReference(reference);setPick(false);showPanel("agent");}} onSelect={(target,address,annotation)=>select(target,address,undefined,annotation)} onEscape={exitTools} onError={setStatus}/>}
        {pick&&<div className="pick-notice" role="status"><span>{explorationActive?"点选任一方案的元素，加入同一草稿":"点击一个元素以附加到 Agent，选中后自动结束"}</span><button onClick={()=>setPick(false)}>取消点选</button></div>}
        {reviews.picking&&<div className="pick-notice" role="status"><span>点击画面任意位置新增批阅，落针后输入评语</span><button onClick={()=>reviews.setPicking(false)}>取消落针</button></div>}
        {status&&!previewError&&<p className="studio-announcement" role="status">{status}{reviewDraftLink&&<> · <a href={reviewDraftLink} target="_blank" rel="noopener noreferrer">打开工作台草稿</a></>}</p>}
        {previewError&&<div className="preview-error" role="alert">{workbenchStatus}</div>}
      </section>
    <aside hidden={!settingsOpen} id="studio-settings" className="settings-drawer" role="dialog" aria-modal="false" aria-labelledby="settings-title">
      <header className="inspector-header"><div><h2 id="settings-title">预览设置</h2><p>选择当前画面与体验环境</p></div><button ref={settingsClose} aria-label="关闭预览设置" onClick={closeSettings}><CloseIcon/></button></header>
      <div className="inspector-body">
        {data.requirements.length>1&&<div className="setting-field"><span>需求</span><Select label="当前需求" value={manifest.id} onValueChange={id=>{location.href="/?id="+encodeURIComponent(id);}} options={data.requirements.map(r=>({value:r.id,label:r.title}))}/></div>}
        <div className="setting-field"><span>方案</span><Select label="方案" disabled={Boolean(data.reviewSource)||Boolean(reviews.pending)||reviews.saving} value={candidate} onValueChange={focusCandidate} options={manifest.candidates.map(c=>({value:c.id,label:c.title}))}/></div>
        <div className="setting-field"><span>视口</span><Select label="视口" value={viewportId} onValueChange={setViewport} options={manifest.viewports.map(v=>({value:v.id,label:v.title,description:v.width+" × "+v.height}))}/></div>
        <p className="drawer-help">抽屉覆盖画布；展开或收起不会改变产品视口和操作状态。</p>
      </div>
    </aside>
    {panel&&<aside id="studio-inspector" className="inspector-drawer" data-pick-hidden={pick||reviews.picking} role="dialog" aria-modal="false" aria-labelledby="inspector-title" inert={pick||reviews.picking}>
      <header className="inspector-header"><div className="inspector-title-group">{panel==="agent"&&data.development?<AgentSessionControls agent={agent}/>:<h2 id="inspector-title">{panelNames[panel]}</h2>}</div><div className="inspector-header-actions">{panel==="agent"&&data.development&&<ProviderStatus agent={agent}/>}<button className="inspector-close" ref={closeButton} aria-label="关闭辅助面板" title="关闭 · Esc" onClick={closePanel}><CloseIcon/></button></div></header>
      <div className={"inspector-body "+(panel==="agent"?"agent-body":"")}>
        {panel==="docs"&&<div className="documentation" ref={docRef}>
          <InteractionReader interactions={visibleInteractions} page={visiblePage} pageTitle={visibleManifest.pages.find(p=>p.id===visiblePage)!.title} state={runtimeState} elements={visibleElements} selected={selectedAnnotation} overview={currentExploration?.data.documentation??proposal?.documentation??data.documentation} foundation={manifest.foundationVersion} onLocate={locateAnnotation}/>
          {duplicates.length>0&&<p className="validation-warning" role="alert">重复的定位标识：{duplicates.join("、")}</p>}
          {missing.length>0&&elements.length>0&&<p className="validation-warning">当前画面尚未出现说明目标：{missing.map(a=>a.target).join("、")}。请在对应状态核对。</p>}
        </div>}
        {panel==="reviews"&&<ReviewPanel reviews={reviews} manifest={manifest} token={data.token} page={page} onPick={beginReview} onLocate={locateReview} onAdd={addReviewDraft} pickDisabledReason={reviewPickDisabledReason} blocked={exporting||navigationPending||Boolean(reviewOriginState&&reviewOriginState!=="ready")}/>}{panel==="reviews"&&reviewOriginState&&reviewOriginState!=="ready"&&<p className="review-error">原提案当前不可新增批阅，评语与截图仍保留。请回到本地工作台在最新设计继续批阅。</p>}
        {panel==="agent"&&<AgentPanel data={data} agent={agent} reviewWindowId={reviewWindowId} enabled={data.development} blocked={exporting||navigationPending} blockedReason={navigationPending?"请先完成或取消页面切换。":undefined} selection={selection} selectionStale={selectionStale} onPick={()=>{setSettingsOpen(false);setPick(true);}} onClear={()=>{setSelection(null);setSelectionStale(false);setSelected("");setInspectDomId("");setInstance("");}} onLevel={setInspectDomId}/>}
        {panel==="tools"&&<section className="workbench-tools" aria-label="画面工具">
          <div className="tool-grid">
            <button className="tool-card" aria-pressed={showAnnotations} onClick={()=>setShowAnnotations(v=>!v)}><CanvasToolIcon tool="annotations"/><span>{showAnnotations?"隐藏标注":"显示标注"}</span></button>
            <button className="tool-card" aria-label="重置当前场景" onClick={()=>currentExploration?currentExploration.reset():chooseScenario(data.scenarios.find(s=>s.page===page&&s.id===scenario.id)?.id??data.scenarios.find(s=>s.page===page)!.id)}><CanvasToolIcon tool="reset"/><span>重置当前场景</span></button>
            <button className="tool-card" aria-label="对比方案" aria-pressed={compare} disabled={!alternate||explorationActive} onClick={toggleCompare}><CanvasToolIcon tool="compare"/><span>{compare?"退出方案对比":"对比方案"}</span></button>
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
