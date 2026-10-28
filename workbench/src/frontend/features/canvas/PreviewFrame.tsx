import {useEffect,useMemo,useRef,useState} from "react";
import type {BundleData,Manifest,Scenario,Value,PreviewContext,Annotation,DomSelection,AgentProposal,NavigationCommand} from "../../../contracts/types";
export function PreviewFrame({data,candidate,page,scenario,viewport,values,pick,locate,instance,annotations,showAnnotations,inspectDomId,locateNonce,proposal,runtimeState,navigationRequest,hidden,active,order,waiting,onActivate,onIntent,onPrepared,onContext,onSelect,onElements,onEscape,onError}:{data:BundleData;candidate:string;page:string;scenario:Scenario;viewport:Manifest["viewports"][number];
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
  const initialPreview=useMemo(()=>data.previews[scenario.page+":"+candidate],[candidate,scenario.id,data.revision]);
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
