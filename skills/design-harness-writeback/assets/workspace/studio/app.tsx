import {useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import type {BundleData,Control,Manifest,Scenario} from "./types";
import "./studio.css";
import harnessIcon from "./assets/harness-icon.png";
const data=(window as unknown as {__DH_DATA__:BundleData}).__DH_DATA__;
const initial=new URLSearchParams(location.hash.slice(1));
type Panel = "docs" | "live" | "feedback";
function ToolIcon({view}:{view:Panel}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {view==="docs"?<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>:view==="live"?<><path d="M4 7h6m5 0h5M4 17h10m5 0h1"/><circle cx="12.5" cy="7" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/></>:<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>}
  </svg>;
}
const numberValues=(candidate:string)=>Object.fromEntries(data.manifest.controls.map(c=>[c.id,data.params[candidate]?.[c.id]??c.default]));
function Frame({candidate,scenario,viewport,values,pick,locate,onSelect,onElements,onEscape}:{candidate:string;scenario:Scenario;viewport:Manifest["viewports"][number];
  values:Record<string,number>;pick:boolean;locate:string;onSelect:(id:string)=>void;onElements:(ids:string[],duplicates:string[])=>void;onEscape:()=>void}) {
  const ref=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null);
  const [available,setAvailable]=useState({width:viewport.width,height:viewport.height});
  const css=Object.fromEntries(data.manifest.controls.map(c=>[c.cssVar,String(values[c.id]??c.default)+c.unit]));
  const config={scenario,candidate,css,pick,locate};
  const current=useRef(config); current.current=config;
  const send=()=>ref.current?.contentWindow?.postMessage({type:"dh:config",config:current.current},"*");
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setAvailable({width:entries[0].contentRect.width,height:entries[0].contentRect.height}));
    if(box.current)observer.observe(box.current);return()=>observer.disconnect();
  },[]);
  useEffect(send,[candidate,scenario,values,pick,locate]);
  useEffect(()=>{
    function receive(event:MessageEvent) {
      if(event.source!==ref.current?.contentWindow)return;
      if(event.data?.type==="dh:mounted")send();
      if(event.data?.type==="dh:escape")onEscape();
      if(event.data?.type==="dh:select" && typeof event.data.id==="string")onSelect(event.data.id);
      if(event.data?.type==="dh:elements" && Array.isArray(event.data.ids))onElements(event.data.ids,event.data.duplicates??[]);
    }
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[candidate,onSelect,onElements,onEscape]);
  const scale=Math.min(1,Math.max(0.05,available.width/viewport.width),Math.max(0.05,(available.height-28)/viewport.height));
  return <div className="frame-column" ref={box}>
    <div className="frame-label"><strong>{data.manifest.candidates.find(c=>c.id===candidate)?.title}</strong><span>{viewport.width} × {viewport.height} · {Math.round(scale*100)}%</span></div>
    <div className="frame-clip" style={{width:viewport.width*scale,height:viewport.height*scale}}>
      <iframe ref={ref} title={"产品预览 · "+candidate} sandbox="allow-scripts allow-downloads" srcDoc={data.previews[scenario.page+":"+candidate]}
        onLoad={send} style={{width:viewport.width,height:viewport.height,transform:"scale("+scale+")"}}/>
    </div>
  </div>;
}
function App() {
  const manifest=data.manifest;
  const [page,setPage]=useState(manifest.pages.find(p=>p.id===initial.get("page"))?.id??manifest.pages[0].id);
  const [scenarioId,setScenario]=useState(data.scenarios.find(s=>s.id===initial.get("scenario")&&s.page===page)?.id??data.scenarios.find(s=>s.page===page)!.id);
  const [candidate,setCandidate]=useState(manifest.candidates.find(c=>c.id===initial.get("candidate"))?.id??manifest.candidates[0].id);
  const [viewportId,setViewport]=useState(manifest.viewports.find(v=>v.id===initial.get("viewport"))?.id??manifest.viewports[0].id);
  const [compare,setCompare]=useState(false),[pick,setPick]=useState(false),[selected,setSelected]=useState("");
  const [panel,setPanel]=useState<Panel|null>(null),[status,setStatus]=useState(""),[note,setNote]=useState("");
  const [values,setValues]=useState(Object.fromEntries(manifest.candidates.map(c=>[c.id,numberValues(c.id)])));
  const [hashes,setHashes]=useState(data.hashes),[dirty,setDirty]=useState<Record<string,boolean>>({});
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const [saving,setSaving]=useState(false);
  const [elements,setElements]=useState<string[]>([]),[duplicates,setDuplicates]=useState<string[]>([]);
  const [reset,setReset]=useState(0);
  const docRef=useRef<HTMLDivElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const triggerRef=useRef<HTMLElement|null>(null);
  function showPanel(view:Panel,trigger?:HTMLElement) {
    if(trigger)triggerRef.current=trigger;
    else if(!panel && document.activeElement instanceof HTMLElement)triggerRef.current=document.activeElement;
    setPanel(view);
  }
  function closePanel() {
    setPanel(null);setPick(false);
    requestAnimationFrame(()=>{if(triggerRef.current?.isConnected)triggerRef.current.focus({preventScroll:true});});
  }
  useEffect(()=>{if(panel)closeButton.current?.focus({preventScroll:true});},[panel]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape" && (panel||pick)) {event.preventDefault();closePanel();}
    };
    window.addEventListener("keydown",escape);
    return()=>window.removeEventListener("keydown",escape);
  },[panel,pick]);
  const scenario=data.scenarios.find(s=>s.id===scenarioId&&s.page===page)??data.scenarios.find(s=>s.page===page)!;
  const viewport=manifest.viewports.find(v=>v.id===viewportId)!;
  const alternate=manifest.candidates.find(c=>c.id!==candidate);
  useEffect(()=>{
    const state=new URLSearchParams({page,scenario:scenario.id,candidate,viewport:viewportId});
    history.replaceState(null,"","#"+state);
  },[page,scenario,candidate,viewportId]);
  useEffect(()=>{
    if(!data.development)return;
    let pending=false,cancelled=false;
    const timer=setInterval(async()=>{
      if(pending || Object.values(dirty).some(Boolean))return;
      pending=true;
      try {
        const response=await fetch("/__dh/revision?id="+manifest.id);
        if(response.ok) {
          const revision=(await response.json()).revision;
          if(!cancelled && !Object.values(dirtyRef.current).some(Boolean) && revision!==data.revision)location.reload();
        }
      } catch {/* 页面保留当前内容，服务恢复后再次读取。 */}
      finally {pending=false;}
    },1400);
    return()=>{cancelled=true;clearInterval(timer);};
  },[dirty,manifest.id]);
  useEffect(()=>{
    if(!selected)return;
    const section=scenario.annotations.find(a=>a.target===selected)?.section;
    const target=section ? docRef.current?.querySelector("#"+CSS.escape(section)) : null;
    docRef.current?.querySelectorAll(".active-section").forEach(el=>el.classList.remove("active-section"));
    target?.classList.add("active-section");target?.scrollIntoView({block:"nearest"});
  },[selected,scenario,panel]);
  const select=(id:string)=>{setSelected(id);showPanel("live");};
  const observe=(ids:string[],dupes:string[])=>{setElements(ids);setDuplicates(dupes);};
  const feedback=JSON.stringify({requirement:manifest.id,page,scenario:scenario.id,candidate,viewport:viewportId,target:selected||null,feedback:note},null,2);
  async function copyFeedback() {
    try {await navigator.clipboard.writeText(feedback);setStatus("已复制带定位信息的反馈");}
    catch {download("设计反馈.json",feedback);setStatus("已下载反馈文件");}
  }
  function download(name:string,content:string) {
    const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function save() {
    if(saving)return;
    if(!data.development) {download(candidate+".json",JSON.stringify(values[candidate],null,2)+"\n");return;}
    setSaving(true);
    setStatus("正在保存候选参数…");
    try {
      const response=await fetch("/__dh/params",{method:"POST",headers:{"Content-Type":"application/json","X-DH-Token":data.token!},
        body:JSON.stringify({id:manifest.id,candidate,expectedHash:hashes[candidate],values:values[candidate]})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setHashes(old=>({...old,[candidate]:result.hash}));setDirty(old=>({...old,[candidate]:false}));
      setStatus("候选参数已保存到源文件");
    } catch(error) {setStatus("保存失败："+(error as Error).message);}
    finally {setSaving(false);}
  }
  async function exportRelease() {
    const version=prompt("固定交付版本（已有版本不会覆盖）","v1");if(!version)return;
    setStatus("正在生成固定交付…");
    try {
      const response=await fetch("/__dh/export",{method:"POST",headers:{"Content-Type":"application/json","X-DH-Token":data.token!},
        body:JSON.stringify({id:manifest.id,version})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setStatus("已导出："+result.directory);
    } catch(error) {setStatus("导出失败："+(error as Error).message);}
  }
  const missing=scenario.annotations.filter(a=>!elements.includes(a.target));
  const panelNames:Record<Panel,string>={docs:"交互说明",live:"Live 调整",feedback:"定位反馈"};
  const locate=panel||pick ? selected : "";
  return <div className="studio-shell">
    <header className="studio-header">
      <a className="studio-brand" href="#" onClick={event=>event.preventDefault()}><img className="brand-mark" src={harnessIcon} alt=""/><span>Design Harness<small>设计评审工作台</small></span></a>
      <div className="requirement-title"><span>{data.development?"本地草稿":"固定交付"}</span><h1 title={manifest.title}>{manifest.title}</h1></div>
      {data.requirements.length>1&&<label className="workspace-switch">需求<select aria-label="当前需求" value={manifest.id} onChange={e=>{location.href="/?id="+e.target.value;}}>{data.requirements.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>}
      <div className="header-actions">
        {data.development?<button className="primary" disabled={saving||Object.values(dirty).some(Boolean)} onClick={exportRelease}>导出固定版本</button>:<span className="release-label">离线体验</span>}
      </div>
    </header>
    <main className="studio-main">
      <section className="toolbar" aria-label="预览设置">
        <label>页面<select aria-label="页面" value={page} onChange={e=>{setPage(e.target.value);setScenario(data.scenarios.find(s=>s.page===e.target.value)!.id);setSelected("");}}>{manifest.pages.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <label>场景<select aria-label="场景" value={scenario.id} onChange={e=>{setScenario(e.target.value);setSelected("");}}>{data.scenarios.filter(s=>s.page===page).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>方案<select aria-label="方案" value={candidate} onChange={e=>setCandidate(e.target.value)}>{manifest.candidates.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label>视口<select aria-label="视口" value={viewportId} onChange={e=>setViewport(e.target.value)}>{manifest.viewports.map(v=><option key={v.id} value={v.id}>{v.title} · {v.width}</option>)}</select></label>
        <div className="toolbar-buttons"><button aria-label="重置当前场景" onClick={()=>{setReset(v=>v+1);setElements([]);setSelected("");}}>↻</button><button aria-pressed={compare} disabled={!alternate} onClick={()=>setCompare(v=>!v)}>对比方案</button><button className={pick?"active":""} aria-pressed={pick} onClick={()=>setPick(v=>!v)}>{pick?"结束点选":"点选界面"}</button></div>
      </section>
      <div className="preview-heading"><div><span>设计预览</span><h2>{scenario.title}</h2></div><p>{pick?"点选界面区域以查看说明或调整视觉":"直接操作页面，体验当前流程"}</p></div>
      <section className={"preview-stage "+(compare?"comparing":"")} aria-label="设计预览">
        <Frame key={candidate+":"+reset} candidate={candidate} scenario={scenario} viewport={viewport} values={values[candidate]} pick={pick} locate={locate} onSelect={select} onElements={observe} onEscape={closePanel}/>
        {compare&&alternate&&<Frame key={alternate.id+":"+reset} candidate={alternate.id} scenario={scenario} viewport={viewport} values={values[alternate.id]} pick={false} locate={locate} onSelect={select} onElements={()=>{}} onEscape={closePanel}/>}
        <nav className="floating-tools" aria-label="辅助工具">
          {(["docs","live","feedback"] as Panel[]).map(view=><button key={view} aria-label={panelNames[view]} title={panelNames[view]} aria-expanded={panel===view} aria-controls="studio-inspector" onClick={event=>panel===view?closePanel():showPanel(view,event.currentTarget)}><ToolIcon view={view}/><span>{({docs:"说明",live:"Live",feedback:"反馈"} as Record<Panel,string>)[view]}</span>{view==="live"&&Object.values(dirty).some(Boolean)&&<span className="unsaved-dot" aria-hidden="true"/>}</button>)}
        </nav>
      </section>
      <footer className="studio-footer">
        <p className="studio-status" role="status">{status||(Object.values(dirty).some(Boolean)?"有未保存的调参，可打开 Live 继续编辑":"交互说明、Live 与反馈可按需打开")}</p>
        {(duplicates.length>0||missing.length>0)&&<button onClick={event=>showPanel("docs",event.currentTarget)}>定位检查（{duplicates.length+missing.length}）</button>}
      </footer>
    </main>
    {panel&&<aside id="studio-inspector" className="inspector-drawer" role="dialog" aria-modal="false" aria-labelledby="inspector-title">
      <header className="inspector-header"><div><span className="eyebrow">辅助工具</span><h2 id="inspector-title">{panelNames[panel]}</h2></div><button ref={closeButton} aria-label="关闭辅助面板" title="关闭 · Esc" onClick={closePanel}>×</button></header>
      <nav className="inspector-tabs" aria-label="切换辅助面板">{(["docs","live","feedback"] as Panel[]).map(view=><button key={view} aria-pressed={panel===view} onClick={()=>setPanel(view)}>{({docs:"说明",live:"Live",feedback:"反馈"} as Record<Panel,string>)[view]}</button>)}</nav>
      <div className="inspector-body">
        {panel==="docs"&&<div className="documentation" ref={docRef}>
          <div className="doc-caption"><span className="eyebrow">PRD / UX</span><span>基础 {manifest.foundationVersion}</span></div>
          <article dangerouslySetInnerHTML={{__html:data.documentation}}/>
          <div className="doc-connections"><h3>本场景说明定位</h3>{scenario.annotations.map(a=><button key={a.target} className={selected===a.target?"selected":""} onClick={()=>setSelected(a.target)}>{a.target}<span>↗</span></button>)}</div>
          {duplicates.length>0&&<p className="validation-warning" role="alert">重复的定位标识：{duplicates.join("、")}</p>}
          {missing.length>0&&elements.length>0&&<p className="validation-warning">当前画面尚未出现说明目标：{missing.map(a=>a.target).join("、")}。请在对应状态核对。</p>}
        </div>}
        {panel==="live"&&<section className="live-panel" aria-label="局部视觉调整">
          <div className="panel-heading"><h3>{selected?"当前区域 · "+selected:"局部视觉调整"}</h3><span>修改 {manifest.candidates.find(c=>c.id===candidate)?.title}</span></div>
          <p className="panel-description">点选画面中的区域，或直接调整当前方案的参数。</p>
          <div className="parameter-grid">{manifest.controls.filter(c=>!selected||c.target===selected).map((c:Control)=><label key={c.id} className="parameter" htmlFor={"parameter-"+c.id}><span>{c.label}<output>{values[candidate][c.id]}{c.unit}</output></span>
            <input id={"parameter-"+c.id} disabled={saving} type="range" min={c.min} max={c.max} step={c.step} value={values[candidate][c.id]} onChange={e=>{setValues(old=>({...old,[candidate]:{...old[candidate],[c.id]:Number(e.target.value)}}));setDirty(old=>({...old,[candidate]:true}));}}/></label>)}</div>
          {selected&&!manifest.controls.some(c=>c.target===selected)&&<p className="muted">该区域尚未定义参数，可以复制定位反馈交给 Agent 修改 React 页面。</p>}
          <div className="live-footer"><button className="primary" disabled={saving} onClick={save}>{data.development?"保存候选参数":"下载调参文件"}</button><button disabled={saving} onClick={()=>{setValues(old=>({...old,[candidate]:numberValues(candidate)}));setDirty(old=>({...old,[candidate]:false}));}}>恢复载入值</button><span>{dirty[candidate]?"有尚未保存的参数":"参数与载入版本一致"}</span></div>
        </section>}
        {panel==="feedback"&&<section className="feedback-panel" aria-label="定位反馈">
          <div className="feedback-target"><span>当前区域</span><strong>{selected||"尚未点选"}</strong><p>{scenario.title} · {manifest.candidates.find(c=>c.id===candidate)?.title}</p></div>
          <label htmlFor="feedback">给 Agent 的反馈</label><textarea id="feedback" value={note} onChange={e=>setNote(e.target.value)} rows={5} placeholder="说明这个区域需要怎样调整…"/>
          <button className="primary" onClick={copyFeedback}>复制定位反馈</button>
        </section>}
      </div>
    </aside>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
