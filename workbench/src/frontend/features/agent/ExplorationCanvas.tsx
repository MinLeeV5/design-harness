import {useEffect,useMemo,useRef,useState} from "react";
import type {AgentProposal,BundleData,CanvasCapture,DomSelection,ExplorationOption,Manifest,OptionReference,PreviewContext,Scenario} from "../../../contracts/types";
import {proposalPage} from "../../../contracts/exploration.mjs";
import {tuneProposal} from "../../../contracts/agent-controls.mjs";
import {captureFrame} from "../../api/preview";
import {Select} from "../../ui/Select";
import {PreviewFrame} from "../canvas/PreviewFrame";
import {annotationsFor} from "../interactions/InteractionReader";
import {useNavigation} from "../navigation/use-navigation";
import type {useAgent} from "./use-agent";
import {optionStatus} from "./ExplorationPanel";
import "./exploration.css";

export type ExplorationView={group:string;option:string;version:string;data:BundleData;context:PreviewContext;scenario:Scenario;interacting:boolean;elements:string[];duplicates:string[];pending:boolean;capture:()=>Promise<CanvasCapture>;navigate:(page:string)=>void;chooseScenario:(scenario:string)=>void;reset:()=>void};
type Props={agent:ReturnType<typeof useAgent>;data:BundleData;viewport:Manifest["viewports"][number];pick:boolean;showAnnotations:boolean;locate:string;inspectDomId:string;locateNonce:number;onView:(view:ExplorationView|null)=>void;onReference:(reference:OptionReference)=>void;onSelect:(target:string,instance:string,annotation?:string)=>void;onEscape:()=>void;onError:(message:string)=>void};

type Tiling={columns:number;rows:number;span?:"columns"|"rows"};
function tileOptions(count:number,width:number,height:number,viewport:Props["viewport"]):Tiling{
  if(count<=1)return {columns:1,rows:1};
  if(count===4)return {columns:2,rows:2};
  const choices:Tiling[]=count===2?[{columns:2,rows:1},{columns:1,rows:2}]:count===3?
    [{columns:3,rows:1},{columns:1,rows:3},{columns:2,rows:2,span:"columns"},{columns:2,rows:2,span:"rows"}]:
    Array.from({length:count},(_,index)=>({columns:index+1,rows:Math.ceil(count/(index+1))}));
  // Prefer the arrangement with the largest smallest preview, including card controls.
  function score({columns,rows}:Tiling){
    const cellWidth=(width-12*(columns-1))/columns,cellHeight=(height-12*(rows-1))/rows;
    const controls=cellWidth<=260||cellHeight<=240?116:160;
    return Math.max(0,Math.min(1,(cellWidth-16)/viewport.width,(cellHeight-controls)/viewport.height));
  }
  return choices.reduce((best,next)=>score(next)>score(best)?next:best);
}

function OptionPreview({option,active,groupId,reference,props,onFocus}:{option:ExplorationOption;active:boolean;groupId:string;reference:OptionReference;props:Props;onFocus:()=>void}){
  const {agent,data,viewport,pick,showAnnotations,locate,inspectDomId,locateNonce}=props,proposal=option.proposal!;
  const valueKey=groupId+":"+option.id+":"+option.version,values=agent.optionValues[valueKey]??((agent.job?.exploration?.selected??agent.job?.exploration?.focused)===option.id?agent.values:{});
  const tuned=useMemo(()=>tuneProposal(proposal,values),[proposal.jobId,proposal.html,values]);
  const ownData=useMemo<BundleData>(()=>({...data,manifest:proposal.manifest??data.manifest,scenarios:proposal.scenarios??data.scenarios,interactions:proposal.interactions??data.interactions,documentation:proposal.documentation??data.documentation,previews:{[agent.job!.candidate]:proposal.html},specs:Object.fromEntries(Object.entries(proposal.pages??{[proposal.page!]:{spec:proposal.spec}}).map(([page,item])=>[agent.job!.candidate+":"+page,item.spec])),params:{[agent.job!.candidate]:{css:proposal.css}}}),[proposal.jobId,proposal.html,data.revision]);
  const candidate=agent.job!.candidate,initialPage=ownData.manifest.pages.some(page=>page.id===proposal.page)?proposal.page!:ownData.manifest.pages[0].id;
  const [scenarioId,setScenario]=useState(ownData.scenarios.find(item=>item.page===initialPage)!.id),[context,setContext]=useState<PreviewContext>(),[reset,setReset]=useState(0),[interacting,setInteracting]=useState(false),[elements,setElements]=useState<string[]>([]),[duplicates,setDuplicates]=useState<string[]>([]),[error,setError]=useState("");
  const frame=useRef<HTMLIFrameElement|null>(null),scenario=ownData.scenarios.find(item=>item.id===scenarioId)!,page=context?.page??scenario.page;
  const state=context?.state??{...ownData.specs[candidate+":"+page].state,...scenario.state},preview=proposalPage(tuned,page)!;
  const navigation=useNavigation({candidate,compare:false,comparisonIds:[],busy:()=>agent.submitting,onStatus:setError});
  const latest=useRef({props,page,state,navigation,chooseScenario:(id:string)=>{},reset:()=>{}});
  function chooseScenario(id:string){const next=ownData.scenarios.find(item=>item.id===id);if(!next)return;navigation.cancelNavigation();setScenario(id);setContext(undefined);setInteracting(false);setReset(value=>value+1);}
  latest.current={props,page,state,navigation,chooseScenario,reset:()=>chooseScenario(scenario.id)};
  const bridge=useMemo(()=>({capture:()=>frame.current?captureFrame(frame.current,latest.current.page,latest.current.state):Promise.reject(new Error("方案画面尚未加载")),navigate:(next:string)=>latest.current.navigation.navigate(next),chooseScenario:(id:string)=>latest.current.chooseScenario(id),reset:()=>latest.current.reset()}),[]);
  useEffect(()=>{if(active)latest.current.props.onView({group:groupId,option:option.id,version:option.version!,data:ownData,context:{page,state},scenario,interacting,elements,duplicates,pending:navigation.navigationPending,...bridge});},[active,groupId,option.id,option.version,ownData,page,context,scenario,interacting,elements,duplicates,navigation.navigationPending]);
  const selected=async(target:string,instance:string,detail?:DomSelection,annotation?:string)=>{onFocus();if(annotation){props.onSelect(target,instance,annotation);return;}if(!detail)return;try{const capture=await bridge.capture();props.onReference({...reference,page:capture.page,selection:detail,state:capture.state,capture,label:option.label,title:option.title});}catch(error){props.onError((error as Error).message);}};
  return <><div className="exploration-option-context"><Select label={option.label+" 的页面"} value={page} options={ownData.manifest.pages.map(item=>({value:item.id,label:item.title}))} onValueChange={next=>{onFocus();navigation.navigate(next);}}/><span>{ownData.manifest.pages.length} 页</span></div><PreviewFrame minScale={0} key={scenario.id+":"+reset} data={ownData} candidate={candidate} page={page} scenario={scenario} viewport={viewport} values={{}} hidden={false} active={active} order={0} waiting={navigation.waitingCandidates.includes(candidate)} onActivate={onFocus} sessionKey={groupId+":"+option.id+":"+option.version} label={option.label} onFrame={node=>{frame.current=node;}} pick={pick} locate={active?locate:""} instance="" annotations={annotationsFor(ownData.interactions,page,state)} showAnnotations={showAnnotations} inspectDomId={active?inspectDomId:""} locateNonce={locateNonce} proposal={preview} runtimeState={state} navigationRequest={navigation.navigationCommands[candidate]} onIntent={next=>{onFocus();navigation.navigate(next);}} onPrepared={(serial,allowed)=>navigation.prepared(candidate,serial,allowed)} onContext={next=>{setContext(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);setInteracting(JSON.stringify(next.state)!==JSON.stringify({...ownData.specs[candidate+":"+scenario.page]?.state,...scenario.state})||next.page!==scenario.page);}} onSelect={(target,instance,detail,annotation)=>void selected(target,instance,detail,annotation)} onElements={(ids,dupes)=>{setElements(old=>JSON.stringify(old)===JSON.stringify(ids)?old:ids);setDuplicates(old=>JSON.stringify(old)===JSON.stringify(dupes)?old:dupes);}} onEscape={props.onEscape} onError={setError}/>{error&&<p role="status">{error}</p>}</>;
}

export function ExplorationCanvas(props:Props){
  const group=props.agent.job!.exploration!,[expanded,setExpanded]=useState(""),focused=group.focused??group.selected??group.options.find(option=>option.proposal)?.id;
  const grid=useRef<HTMLDivElement>(null),[available,setAvailable]=useState({width:props.viewport.width,height:props.viewport.height});
  const baseline:ExplorationOption|undefined=!group.options.length&&group.baseProposal?{id:"baseline",label:group.parent?.label??"基线",title:"本轮探索基线",brief:group.conclusions??"",version:group.parent?.version??"base",versions:[],state:"ready",proposal:group.baseProposal}:undefined;
  const options=baseline?[baseline]:group.options;
  const tiling=tileOptions(expanded?1:options.length,available.width,available.height,props.viewport);
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>setAvailable({width:entry.contentRect.width,height:entry.contentRect.height}));if(grid.current)observer.observe(grid.current);return()=>observer.disconnect();},[]);
  useEffect(()=>()=>props.onView(null),[group.id]);
  useEffect(()=>{setExpanded(previous=>previous?(baseline?"baseline":focused??""):"");},[group.id,focused,Boolean(baseline)]);
  function focus(option:string){if(option!=="baseline"&&option!==focused)void props.agent.explorationAction("focus",option);}
  return <section className="exploration-canvas" aria-label="多方案比较" data-round={group.id}>
    <header className="exploration-canvas-heading"><div><strong>{group.parent?"基于 "+group.parent.label+" 再探索":"设计方案"}</strong><span>{group.phase==="fusing"?"正在融合方案":group.phase==="refining"?"正在调整方案":"独立体验 · 点选引用 · 原方案保留"}</span></div>{expanded&&<button onClick={()=>setExpanded("")}>查看全部方案</button>}</header>
    <div className="exploration-grid" ref={grid} data-expanded={Boolean(expanded)} data-span={tiling.span} style={{gridTemplateColumns:`repeat(${tiling.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${tiling.rows},minmax(0,1fr))`}}>{options.map(option=><article className="exploration-option" data-option={option.id} data-focused={focused===option.id||Boolean(baseline)} hidden={Boolean(expanded&&expanded!==option.id)} key={option.id}>
      <header><div><h3>{option.label} · {option.title}</h3><p title={option.brief}>{option.brief}</p></div><span>{optionStatus(option.state)}</span></header>
      <div className="exploration-preview">{option.proposal?<OptionPreview key={option.version??option.proposal.jobId} option={option} active={focused===option.id||Boolean(baseline)} groupId={group.id} reference={option.id==="baseline"&&group.parent?group.parent:{group:group.id,option:option.id,version:option.version!}} props={props} onFocus={()=>focus(option.id)}/>:<p role="status">{option.error??optionStatus(option.state)}</p>}</div>
      <footer><button disabled={!option.proposal} onClick={()=>{focus(option.id);setExpanded(expanded===option.id?"":option.id);}}>{expanded===option.id?"缩回总览":"放大查看"}</button>{option.id!=="baseline"&&<button disabled={!option.proposal||props.agent.submitting} aria-pressed={(group.selected??group.focused)===option.id} onClick={()=>void props.agent.explorationAction("select",option.id)}>{(group.selected??group.focused)===option.id?"当前方案 "+option.label:"使用方案 "+option.label}</button>}</footer>
    </article>)}</div>
  </section>;
}
