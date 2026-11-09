import "../../vendor/impeccable/live-browser-dom.js";
import {captureDocument} from "./capture";
import type {PreviewConfig,ReviewAnchor} from "../contracts/types";

const prefix="dh-review-free-";
const instanceFor=(wrapper:Element)=>[...wrapper.querySelectorAll<HTMLElement>("[data-dh-instance]")].find(node=>node.closest("[data-jr-key]")===wrapper)?.dataset.dhInstance??"";
function rectangle(el:Element):DOMRect|null {
  const style=getComputedStyle(el);if(style.display==="none"||style.visibility!=="visible")return null;
  if(style.display!=="contents"){const r=el.getBoundingClientRect();return r.width>0&&r.height>0?r:null;}
  const rects=[...el.children].map(rectangle).filter((r):r is DOMRect=>!!r);if(!rects.length)return null;
  const x=Math.min(...rects.map(r=>r.left)),y=Math.min(...rects.map(r=>r.top));return new DOMRect(x,y,Math.max(...rects.map(r=>r.right))-x,Math.max(...rects.map(r=>r.bottom))-y);
}
function identity(el:Element){for(const key of ["data-testid","id","aria-label","name","placeholder"])if(el.getAttribute(key))return (key+":"+el.getAttribute(key)).slice(0,300);return el.childElementCount===0&&el.textContent?.trim()?"text:"+el.textContent.trim().slice(0,250):"";}
function baseFor(el:Element){
  const wrapper=el.closest<HTMLElement>("[data-jr-key]"),part=el.closest<HTMLElement>("[data-dh-part]");
  const base=part&&part.closest("[data-jr-key]")===wrapper?part:wrapper??document.body;
  return {base,target:wrapper?(wrapper.dataset.jrKey!+(base===part?"/"+part!.dataset.dhPart:"")):"",instance:wrapper?instanceFor(wrapper):""};
}
function pathTo(el:Element,base:Element){const parts=[];for(let node=el;node!==base&&node.parentElement;node=node.parentElement){const tag=node.tagName.toLowerCase(),siblings=[...node.parentElement.children].filter(other=>other.tagName===node.tagName);parts.unshift(tag+":nth-of-type("+(siblings.indexOf(node)+1)+")");}return parts.length?":scope > "+parts.join(" > "):"";}
export function anchorAt(el:Element,x:number,y:number):ReviewAnchor {
  const {base,target,instance}=baseFor(el),r=rectangle(el)??new DOMRect(0,0,innerWidth,innerHeight);
  return {target,instance,selector:pathTo(el,base),tag:el.tagName.toLowerCase(),text:identity(el),x:Math.max(0,Math.min(1,(x-r.left)/r.width)),y:Math.max(0,Math.min(1,(y-r.top)/r.height)),view:{x,y,width:innerWidth,height:innerHeight}};
}
export function locateReview(anchor:ReviewAnchor):Element|null {
  let base:Element|undefined=document.body;
  if(anchor.target){const [key,part]=anchor.target.split("/"),wrappers=[...document.querySelectorAll<HTMLElement>('[data-jr-key="'+CSS.escape(key)+'"]')];base=anchor.instance?wrappers.find(node=>instanceFor(node)===anchor.instance):wrappers.length===1?wrappers[0]:undefined;if(part)base=base?.querySelector('[data-dh-part="'+CSS.escape(part)+'"]')??undefined;}
  if(!base)return null;
  const sameTag=(el:Element|null)=>!!el&&el.tagName.toLowerCase()===anchor.tag;
  const matches=(el:Element|null)=>sameTag(el)&&(!anchor.text||identity(el!)===anchor.text);
  try{const exact=anchor.selector?base.querySelector(anchor.selector):base;if(matches(exact))return exact;
    if(anchor.text){const alternatives=[base,...base.querySelectorAll(anchor.tag)].filter(node=>matches(node));if(alternatives.length===1)return alternatives[0];}
    // Stable parts and a unique tag within a stable component survive copy edits.
    // Repeated instances keep their fingerprint to avoid following another item.
    if(anchor.target&&!anchor.instance&&sameTag(exact)){const candidates=[base,...base.querySelectorAll(anchor.tag)].filter(node=>sameTag(node));if(!anchor.selector||candidates.length===1)return exact;}
  }catch{/* Invalid or removed historical selectors stay unlocated. */}
  return null;
}
export function createReviewOverlay({send}:{send:(message:Record<string,unknown>)=>void}){
  const global=window as unknown as {__IMPECCABLE_LIVE_DOM__:{createLiveBrowserDomHelpers:(options:unknown)=>any}},helpers=global.__IMPECCABLE_LIVE_DOM__.createLiveBrowserDomHelpers({prefix:"dh-review-"});
  let config:PreviewConfig|null=null,frame=0,lastStatuses="",lastLocate="",hover:Element|null=null,lastAnchors="";
  const nodes=new Map<string,Element|null>();
  const buttons=new Map<string,HTMLButtonElement>();
  const layer=document.createElement("div");layer.id=prefix+"layer";Object.assign(layer.style,{position:"fixed",inset:"0",pointerEvents:"none",zIndex:"2147483646"});helpers.uiAppend(layer);
  const outline=document.createElement("div");Object.assign(outline.style,{position:"fixed",display:"none",border:"2px solid #af5b17",background:"#af5b170a",boxSizing:"border-box"});layer.appendChild(outline);
  const stopModals=helpers.watchModalDialogs();
  function draw(){
    frame=0;if(!config)return;if(!layer.isConnected)helpers.uiAppend(layer);const shown=new Set<string>();
    const locate=config.page+":"+config.reviewLocate+":"+config.locateNonce;if(config.reviewLocate&&locate!==lastLocate){const item=config.reviews?.find(t=>t.id===config!.reviewLocate),node=item&&locateReview(item.anchor);if(node&&rectangle(node)){(getComputedStyle(node).display==="contents"?node.firstElementChild:node)?.scrollIntoView({block:"nearest",inline:"nearest"});lastLocate=locate;}}
    const statuses:Record<string,string>={},modal=[...document.querySelectorAll("dialog:modal")].at(-1),tracked:Element[]=[];
    for(const review of config.reviews??[]){if(!nodes.get(review.id)?.isConnected)nodes.set(review.id,locateReview(review.anchor));const node=nodes.get(review.id)??null,r=node&&rectangle(node),available=!!r&&(!modal||modal.contains(node));statuses[review.id]=available?"located":"unavailable";if(node)tracked.push(node);
      if(!available||!r||!config.showReviews||config.reviewPick||config.pick)continue;
      const x=r.left+review.anchor.x*r.width,y=r.top+review.anchor.y*r.height;if(x<0||y<0||x>innerWidth||y>innerHeight)continue;
      let clipped=false;for(let parent=node!.parentElement;parent&&parent!==document.body;parent=parent.parentElement){const style=getComputedStyle(parent),b=parent.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(style.overflowX+style.overflowY)&&(x<b.left||x>b.right||y<b.top||y>b.bottom)){clipped=true;break;}}if(clipped)continue;
      let pin=buttons.get(review.id);if(!pin){pin=document.createElement("button");pin.type="button";pin.dataset.reviewId=review.id;pin.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();send({type:"dh:review-focus",id:review.id,page:config!.page,candidate:config!.candidate,session:config!.session});});buttons.set(review.id,pin);layer.appendChild(pin);}shown.add(review.id);pin.setAttribute("aria-label","批阅 "+review.number);pin.title="批阅 "+review.number;if(pin.textContent!==String(review.number))pin.textContent=String(review.number);
      Object.assign(pin.style,{position:"fixed",left:Math.max(0,Math.min(innerWidth-28,x))+"px",top:Math.max(0,Math.min(innerHeight-28,y))+"px",width:"28px",height:"28px",minHeight:"0",padding:"0",border:config.reviewLocate===review.id?"2px solid #fff":"1px solid #8c4a12",borderRadius:"14px 14px 14px 3px",background:"#af5b17",color:"white",font:"600 13px/24px system-ui",pointerEvents:"auto",cursor:"pointer",boxShadow:"0 1px 6px #0004"});
    }
    for(const [id,pin]of buttons)if(!shown.has(id)){pin.remove();buttons.delete(id);}
    const hovered=config.reviewPick&&hover?rectangle(hover):null;if(hovered)Object.assign(outline.style,{display:"block",left:hovered.x+"px",top:hovered.y+"px",width:hovered.width+"px",height:hovered.height+"px"});else outline.style.display="none";
    const signature=JSON.stringify({page:config.page,session:config.session,statuses});if(signature!==lastStatuses){lastStatuses=signature;send({type:"dh:review-locations",page:config.page,candidate:config.candidate,session:config.session,statuses});}
    if(config.showReviews&&tracked.length&&document.visibilityState!=="hidden"&&document.getAnimations().some(animation=>{const target=(animation.effect as KeyframeEffect|null)?.target;return animation.playState==="running"&&target instanceof Element&&tracked.some(node=>target.contains(node));}))schedule();
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
  const target=(event:Event)=>event.composedPath().find(node=>node instanceof Element&&!helpers.own(node)) as Element|undefined;
  function choose(el:Element,x:number,y:number){if(!config)return;try{const anchor=anchorAt(el,x,y),html=captureDocument();config={...config,reviewPick:false};hover=null;send({type:"dh:review-point",anchor,html,page:config.page,candidate:config.candidate,session:config.session});schedule();}catch(error){send({type:"dh:review-error",error:(error as Error).message});}}
  function block(event:Event){if(!config?.reviewPick)return;const el=event.composedPath().find(node=>node instanceof Element) as Element|undefined;if(!el||helpers.own(el))return;event.preventDefault();event.stopImmediatePropagation();if(event.type==="click"){const e=event as MouseEvent;choose(el,e.clientX,e.clientY);}}
  const move=(event:Event)=>{if(config?.reviewPick){hover=target(event)??null;schedule();}};
  const key=(event:KeyboardEvent)=>{if(!config?.reviewPick)return;if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();send({type:"dh:escape"});}else if((event.key==="Enter"||event.key===" ")&&event.target instanceof Element&&!helpers.own(event.target)){const r=rectangle(event.target);if(r){event.preventDefault();event.stopImmediatePropagation();choose(event.target,r.left+r.width/2,r.top+r.height/2);}}};
  const events=["pointerdown","pointerup","pointercancel","mousedown","mouseup","touchstart","touchend","touchcancel","click","auxclick","dblclick","contextmenu","dragstart"];
  for(const type of events)window.addEventListener(type,block,{capture:true,passive:false});window.addEventListener("pointermove",move,true);window.addEventListener("scroll",schedule,true);window.addEventListener("resize",schedule);window.addEventListener("keydown",key,true);
  const observer=new MutationObserver(records=>{const product=records.filter(r=>!helpers.own(r.target));if(product.length){if(product.some(r=>r.type!=="attributes"||["id","data-testid","aria-label","name","placeholder","data-jr-key","data-dh-part","data-dh-instance"].includes(r.attributeName??"")))nodes.clear();schedule();}});observer.observe(document.getElementById("root")!,{subtree:true,childList:true,attributes:true,characterData:true});
  const resize=new ResizeObserver(schedule);resize.observe(document.getElementById("root")!);
  const geometry=setInterval(()=>{if(config?.showReviews&&config.reviews?.length&&document.visibilityState!=="hidden")schedule();},120);
  for(const type of ["animationstart","animationend","transitionrun","transitionend","load"])window.addEventListener(type,schedule,true);document.fonts?.addEventListener("loadingdone",schedule);
  return {update(next:PreviewConfig){const signature=JSON.stringify(next.reviews);if(signature!==lastAnchors){lastAnchors=signature;nodes.clear();}config=next;schedule();},dispose(){observer.disconnect();resize.disconnect();clearInterval(geometry);cancelAnimationFrame(frame);stopModals();layer.remove();for(const type of events)window.removeEventListener(type,block,true);for(const type of ["animationstart","animationend","transitionrun","transitionend","load"])window.removeEventListener(type,schedule,true);document.fonts?.removeEventListener("loadingdone",schedule);window.removeEventListener("pointermove",move,true);window.removeEventListener("scroll",schedule,true);window.removeEventListener("resize",schedule);window.removeEventListener("keydown",key,true);}};
}
