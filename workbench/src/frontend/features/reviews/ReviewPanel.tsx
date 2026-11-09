import {useEffect,useRef,useState} from "react";
import {Tooltip} from "@base-ui/react/tooltip";
import {Select} from "../../ui/Select";
import {ReviewImage} from "./ReviewImage";
import {reviewSourceLabel} from "../../../contracts/reviews.mjs";
import type {ReviewThread,Manifest} from "../../../contracts/types";
import type {useReviews} from "./use-reviews";

function Thread({thread,number,reviews,token,onLocate,onAdd,pageTitle,currentPage,pageExists}:{thread:ReviewThread;number:number;reviews:ReturnType<typeof useReviews>;token?:string;onLocate:(t:ReviewThread)=>void;onAdd:(items:ReviewThread[])=>void;pageTitle:string;currentPage:string;pageExists:boolean}){
  const [reply,setReply]=useState(""),[image,setImage]=useState(false),ref=useRef<HTMLElement>(null);
  useEffect(()=>{if(reviews.focused===thread.id){ref.current?.scrollIntoView({block:"nearest"});ref.current?.focus({preventScroll:true});}},[reviews.focused]);
  const location=!pageExists?"原页面不可用":thread.page!==currentPage?"其他页面":reviews.locations[thread.id]==="located"?"可定位":reviews.locations[thread.id]==="unavailable"?"暂不可定位":"等待定位";
  return <article className="review-thread" ref={ref} tabIndex={-1} data-review-thread={thread.id} data-focused={reviews.focused===thread.id}>
    <header><label className="review-check"><input type="checkbox" aria-label={"选择批阅 "+number} checked={reviews.selected.includes(thread.id)} onChange={()=>reviews.choose(thread.id)}/><strong>批阅 {number}</strong></label><span>{thread.resolved?"已解决":"待处理"}</span></header>
    <div className="review-meta"><span>{pageTitle}</span><span>{location}</span><span>{reviewSourceLabel(thread.source)}</span></div>
    <p className="review-text">{thread.text}</p>
    <div className="review-actions"><button onClick={()=>onLocate(thread)}>定位画面</button><button aria-expanded={image} onClick={()=>setImage(v=>!v)}>{image?"收起截图":"查看截图"}</button><button disabled={reviews.saving} onClick={()=>onAdd([thread])}>添加到 Agent</button><button disabled={reviews.saving} onClick={()=>void reviews.resolve(thread)}>{thread.resolved?"重新打开":"标记已解决"}</button></div>
    {image&&<ReviewImage thread={thread} token={token}/>}
    {!!thread.replies.length&&<ol className="review-replies">{thread.replies.map(item=><li key={item.id}><span>回复</span><p className="review-text">{item.text}</p></li>)}</ol>}
    <form className="review-reply" onSubmit={e=>{e.preventDefault();void reviews.reply(thread,reply).then(ok=>{if(ok)setReply("");});}}><textarea aria-label={"回复批阅 "+number} rows={2} value={reply} disabled={reviews.saving} onChange={e=>setReply(e.target.value)} maxLength={12000} placeholder="补充讨论…"/><button disabled={reviews.saving||!reply.trim()} type="submit">回复</button></form>
  </article>;
}
export function ReviewPanel({reviews,manifest,token,page,onPick,onLocate,onAdd,blocked,pickDisabledReason}:{reviews:ReturnType<typeof useReviews>;manifest:Manifest;token?:string;page:string;onPick:()=>void;onLocate:(t:ReviewThread)=>void;onAdd:(items:ReviewThread[])=>void;blocked:boolean;pickDisabledReason?:string}){
  const [pageFilter,setPageFilter]=useState(""),[stateFilter,setStateFilter]=useState("open"),input=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(reviews.pending)input.current?.focus();},[reviews.pending]);
  useEffect(()=>{setPageFilter("");setStateFilter("open");},[manifest.id]);
  useEffect(()=>{const t=reviews.threads.find(t=>t.id===reviews.focused);if(t){setPageFilter("");setStateFilter(t.resolved?"all":"open");}},[reviews.focused]);
  const items=reviews.threads.filter(t=>(!pageFilter||t.page===pageFilter)&&(stateFilter==="all"||(stateFilter==="resolved"?t.resolved:!t.resolved)));
  const pickDisabled=blocked||reviews.saving||Boolean(pickDisabledReason);
  const pickButton=<button className="primary" disabled={pickDisabled} onClick={onPick}>添加批阅</button>;
  return <section className="review-panel" aria-label="自由评审">
    <div className="review-toolbar">{pickDisabledReason?<Tooltip.Root onOpenChange={(_,details)=>{if(details.reason==="escape-key")details.event.preventDefault();}}>
      <Tooltip.Trigger render={<span className="review-pick-disabled" tabIndex={0}/>} delay={180}>{pickButton}</Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Positioner className="workspace-status-positioner" side="bottom" sideOffset={8} align="start" collisionBoundary={document.documentElement} collisionPadding={10}><Tooltip.Popup role="tooltip" className="workspace-status-popup review-pick-tooltip">{pickDisabledReason}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
    </Tooltip.Root>:pickButton}<span>{reviews.threads.filter(t=>!t.resolved).length} 条待处理</span></div>
    {reviews.error&&<div className="review-error" role="alert">{reviews.error}<button disabled={reviews.saving} onClick={()=>void reviews.refresh()}>刷新批阅</button></div>}
    {reviews.pending&&<form className="review-create" onSubmit={e=>{e.preventDefault();void reviews.save();}}><strong>新增批阅 · {manifest.pages.find(p=>p.id===reviews.pending!.page)?.title??reviews.pending.page}</strong><label htmlFor="review-draft">评语</label><textarea ref={input} id="review-draft" rows={4} maxLength={12000} value={reviews.draft} disabled={reviews.saving} onChange={e=>reviews.setDraft(e.target.value)} placeholder="描述这里需要调整的地方…"/><div className="review-actions"><button type="submit" className="primary" disabled={reviews.saving||!reviews.draft.trim()}>{reviews.saving?"正在保存…":"保存批阅"}</button><button type="button" disabled={pickDisabled} onClick={onPick}>重新选择位置</button><button type="button" disabled={reviews.saving} onClick={reviews.cancel}>取消</button></div><small>保存批阅时的画面，评语会跟随当前目标。</small></form>}
    <div className="review-filters"><Select label="批阅页面" value={pageFilter} onValueChange={setPageFilter} options={[{value:"",label:"全部页面"},...manifest.pages.map(p=>({value:p.id,label:p.title}))]}/><Select label="批阅处理状态" value={stateFilter} onValueChange={setStateFilter} options={[{value:"open",label:"待处理"},{value:"resolved",label:"已解决"},{value:"all",label:"全部状态"}]}/></div>
    {!!reviews.selected.length&&<div className="review-batch"><span>已选 {reviews.selectedThreads.length} 条</span><button disabled={reviews.saving||!reviews.selectedThreads.length} onClick={()=>onAdd(reviews.selectedThreads)}>添加所选到 Agent</button></div>}
    {!items.length&&<p className="review-empty">{reviews.threads.length?"当前筛选下没有批阅。":pickDisabledReason?"暂无批阅。":"点击“添加批阅”，在画面任意位置留下意见。"}</p>}
    <div className="review-list">{items.map(t=><Thread key={t.id} thread={t} number={reviews.threads.indexOf(t)+1} reviews={reviews} token={token} pageTitle={manifest.pages.find(p=>p.id===t.page)?.title??t.page} currentPage={page} pageExists={manifest.pages.some(p=>p.id===t.page)} onLocate={onLocate} onAdd={onAdd}/>)}</div>
  </section>;
}
