import {useState} from "react";
import {matchesWhen} from "../../../contracts/conditions.mjs";
import type {Annotation,Interaction} from "../../../contracts/types";
import "./interactions.css";

export function annotationsFor(interactions:Interaction[],page:string,state:Record<string,unknown>,all=false):Annotation[] {
  return interactions.filter(item=>item.page==="*"||item.page===page).map((item,index)=>({id:item.id,target:item.target,section:item.id,label:item.label,placement:item.placement,number:index<20?String.fromCodePoint(0x2460+index):String(index+1)})).filter(item=>all||matchesWhen(interactions.find(entry=>entry.id===item.id)!.when,state));
}
const Rich=({html}:{html:string})=><div className="interaction-rich" dangerouslySetInnerHTML={{__html:html}}/>;
function Content({item}:{item:Interaction}) {
  if(item.view==="dimensions")return <>{item.intro&&<Rich html={item.intro}/>}<dl className="interaction-dimensions">{item.blocks.map(block=><div key={block.dimension} className={"interaction-dimension interaction-dimension-"+block.dimension} data-interaction-dimension={block.dimension}><dt>{block.title}</dt><dd><Rich html={block.html}/></dd></div>)}</dl></>;
  if(item.view==="card")return <><Rich html={item.intro}/>{item.blocks.length>0&&<details><summary>操作与边界</summary>{item.blocks.map((block,index)=><div key={index}><h4>{block.title}</h4><Rich html={block.html}/></div>)}</details>}</>;
  if(item.view==="steps")return <><Rich html={item.intro}/><ol className="interaction-steps">{item.blocks.map((block,index)=><li key={index}><h4>{block.title}</h4><Rich html={block.html}/></li>)}</ol></>;
  if(item.view==="rules")return <><Rich html={item.intro}/><div className="interaction-table"><table><thead><tr><th scope="col">规则</th><th scope="col">行为与边界</th></tr></thead><tbody>{item.blocks.map((block,index)=><tr key={index}><th scope="row">{block.title}</th><td><Rich html={block.html}/></td></tr>)}</tbody></table></div></>;
  return <><Rich html={item.intro}/><dl className="interaction-states">{item.blocks.map((block,index)=><div key={index}><dt>{block.title}</dt><dd><Rich html={block.html}/></dd></div>)}</dl></>;
}
export function InteractionReader({interactions,page,pageTitle,state,elements,selected,overview,foundation,onLocate}:{interactions:Interaction[];page:string;pageTitle:string;state:Record<string,unknown>;elements:string[];selected:string;overview:string;foundation:string;onLocate:(annotation:Annotation)=>void}) {
  const [full,setFull]=useState(false),[scope,setScope]=useState("");
  // A navigation always returns to the relevant page, even if the full reader was open.
  if(scope!==page){setScope(page);if(full)setFull(false);}
  const annotations=annotationsFor(interactions,page,state,true),items=full?interactions:interactions.filter(item=>(item.page==="*"||item.page===page)&&matchesWhen(item.when,state));
  return <div className="interaction-reader"><div className="doc-caption"><span className="eyebrow">交互说明</span><span>基础 {foundation}</span></div>
    <div className="reader-heading"><div><h3>{full?"完整需求":pageTitle}</h3><p>{full?"阅读目标、规则及所有页面的交互说明":"随当前页面与状态更新，点击编号定位画面"}</p></div><button onClick={()=>setFull(value=>!value)}>{full?"返回当前页":"阅读完整需求"}</button></div>
    {full&&<article className="requirement-overview" dangerouslySetInnerHTML={{__html:overview}}/>}
    {!items.length&&<p className="reader-empty">当前状态没有需要显示的交互说明。</p>}
    {items.map(item=>{const annotation=annotations.find(a=>a.id===item.id),available=!!annotation&&matchesWhen(item.when,state)&&elements.includes(item.target),active=selected===item.id;
      return <section id={item.id} key={item.id} className={"interaction-card interaction-view-"+item.view+(active?" active-section":"")} data-interaction-id={item.id}>
        <h3><button className="interaction-title" aria-label={(annotation?.number??"")+" "+item.label} disabled={!available} onClick={()=>annotation&&onLocate(annotation)}>{annotation&&<span className="annotation-number">{annotation.number}</span>}<span>{item.label}</span></button></h3>
        {!available&&<p className="interaction-unavailable">{item.page!=="*"&&item.page!==page?"切换到对应页面后可定位":"目标在当前状态尚未显示"}</p>}
        <Content item={item}/>
        <details className="interaction-sources"><summary>依据与文档</summary><p>{item.file}</p>{item.sources.map((source,index)=><p key={index}>{({user:"用户确认",prd:"需求文档",code:"代码事实",design:"设计提案"} as Record<string,string>)[source.kind]}：{source.ref}</p>)}</details>
      </section>;
    })}
  </div>;
}
