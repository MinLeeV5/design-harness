import {useEffect,useMemo,useRef,useState} from "react";
import type {BundleData,Manifest,Scenario,Value,PreviewContext,Annotation,DomSelection,AgentProposal,NavigationCommand,ReviewThread,ReviewAnchor,CanvasCapture} from "../../../contracts/types";
import {reviewAnchor} from "../../../contracts/reviews.mjs";
type ReviewBridge={picking:boolean;threads:ReviewThread[];show:boolean;locate:string;onPoint:(anchor:ReviewAnchor,capture:CanvasCapture)=>void;onFocus:(id:string)=>void;onLocations:(states:Record<string,string>)=>void;onError:(error:string)=>void};
export function PreviewFrame({data,candidate,page,scenario,viewport,values,pick,locate,instance,annotations,showAnnotations,inspectDomId,locateNonce,proposal,runtimeState,navigationRequest,hidden,active,order,waiting,onActivate,onIntent,onPrepared,onContext,onSelect,onElements,onEscape,onError,review,sessionKey,label,onFrame,minScale=0.05}:{data:BundleData;candidate:string;page:string;scenario:Scenario;viewport:Manifest["viewports"][number];review?:ReviewBridge;sessionKey?:string;label?:string;onFrame?:(frame:HTMLIFrameElement|null)=>void;minScale?:number;
  values:Record<string,Value>;pick:boolean;locate:string;instance:string;annotations:Annotation[];showAnnotations:boolean;inspectDomId:string;locateNonce:number;proposal?:AgentProposal;runtimeState?:Record<string,unknown>;navigationRequest?:NavigationCommand;hidden:boolean;active:boolean;order:number;waiting:boolean;onActivate:()=>void;onIntent:(page:string)=>void;onPrepared:(serial:number,allowed:boolean)=>void;onContext:(context:PreviewContext)=>void;onSelect:(id:string,instance:string,detail?:DomSelection,annotationId?:string)=>void;onElements:(ids:string[],duplicates:string[])=>void;onEscape:()=>void;onError:(error:string)=>void}) {
  const ref=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null);
  const [available,setAvailable]=useState({width:viewport.width,height:viewport.height});
  useEffect(()=>{onError("");},[]);
  const spec=structuredClone(proposal?.spec??data.specs[candidate+":"+page]);
  if(!proposal)for(const c of data.manifest.controls.filter(c=>c.page===page))spec.elements[c.target].props[c.property]=values[c.id];
  const config={scenario,candidate,page,pages:data.manifest.pages.map(p=>p.id),initialState:runtimeState,navigation:data.manifest.navigation,session:(sessionKey??candidate)+":"+scenario.id,spec,css:proposal?.css??data.params[candidate].css,pick,locate,instance,annotations,showAnnotations,inspectDomId,locateNonce,reviewPick:active&&review?.picking,reviews:review?.threads.filter(t=>t.candidate===candidate&&t.page===page).map(t=>({id:t.id,anchor:t.anchor,number:review.threads.indexOf(t)+1})),showReviews:review?.show,reviewLocate:review?.locate};
  const current=useRef(config); current.current=config;
  const send=()=>ref.current?.contentWindow?.postMessage({type:"dh:config",config:current.current},"*");
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setAvailable({width:entries[0].contentRect.width,height:entries[0].contentRect.height}));
    if(box.current)observer.observe(box.current);return()=>observer.disconnect();
  },[]);
  useEffect(send,[candidate,page,scenario,values,pick,locate,instance,showAnnotations,inspectDomId,locateNonce,proposal,annotations,review?.picking,review?.threads,review?.show,review?.locate]);
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
      if(sessionKey&&event.data?.type==="dh:activate")onActivate();
      if(event.data?.type==="dh:error" && typeof event.data.error==="string")onError(event.data.error);
      if(event.data?.type==="dh:select" && typeof event.data.id==="string")onSelect(event.data.id,typeof event.data.instance==="string"?event.data.instance:"",event.data.selection);
      if(event.data?.type==="dh:annotation"&&typeof event.data.id==="string")onSelect(event.data.id,event.data.instance??"",undefined,event.data.annotationId);
      if(event.data?.type==="dh:elements" && Array.isArray(event.data.ids))onElements(event.data.visibleIds??event.data.ids,event.data.duplicates??[]);
      if(review&&event.data?.session===current.current.session&&event.data?.page===current.current.page&&event.data?.candidate===candidate){
        if(event.data.type==="dh:review-point"&&review.picking&&active&&typeof event.data.html==="string")try{const anchor=reviewAnchor(event.data.anchor);review.onPoint(anchor,{html:event.data.html,width:anchor.view.width,height:anchor.view.height,page,state:runtimeState??{}});}catch(error){review.onError((error as Error).message);}
        if(event.data.type==="dh:review-focus"&&review.threads.some(t=>t.id===event.data.id))review.onFocus(event.data.id);
        if(event.data.type==="dh:review-locations"&&event.data.statuses&&typeof event.data.statuses==="object")review.onLocations(Object.fromEntries(Object.entries(event.data.statuses).filter(([id,state])=>review.threads.some(t=>t.id===id)&&["located","unavailable"].includes(String(state)))) as Record<string,string>);
      }
      if(event.data?.type==="dh:review-error"&&typeof event.data.error==="string")review?.onError(event.data.error);
    }
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
  },[candidate,onContext,onSelect,onElements,onEscape,onError,onIntent,onPrepared,review,runtimeState,page,active,sessionKey,onActivate]);
  const initialPreview=useMemo(()=>data.previews[candidate],[candidate,data.revision]);
  const scale=Math.min(1,Math.max(minScale,available.width/viewport.width),Math.max(minScale,(available.height-28)/viewport.height));
  return <div className="frame-column" data-candidate={candidate} data-active={active} hidden={hidden} style={{order}} ref={box}>
    <div className="frame-label"><button className="frame-focus" aria-pressed={active} aria-label={"编辑方案 · "+(label??candidate)} onClick={onActivate}>{label??data.manifest.candidates.find(c=>c.id===candidate)?.title}{active?" · 当前编辑":""}</button><span>{viewport.width} × {viewport.height} · {Math.round(scale*100)}%</span></div>
    <div className="frame-clip" inert={waiting} style={{width:viewport.width*scale,height:viewport.height*scale}}>
      <iframe ref={node=>{ref.current=node;onFrame?.(node);}} title={"产品预览 · "+(label??candidate)} sandbox="allow-scripts allow-downloads" srcDoc={proposal?.html??initialPreview}
        onLoad={()=>{send();sendNavigation();}} style={{width:viewport.width,height:viewport.height,transform:"scale("+scale+")"}}/>
    </div>
    {waiting&&<div className="frame-navigation-wait" role="status">已确认离开，等待另一方案…</div>}
  </div>;
}
