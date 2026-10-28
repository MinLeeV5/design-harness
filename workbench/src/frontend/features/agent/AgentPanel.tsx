import {useEffect,useRef,useState} from "react";
import type {AgentMessage,AgentProposal,DomSelection} from "../../../contracts/types";
import {tuneProposal} from "../../../contracts/agent-controls.mjs";
import {effortLabel} from "../../../contracts/agent-settings.mjs";
import {agentRoles} from "../../../contracts/agent-roles.mjs";
import type {useAgent} from "./use-agent";
import {Select} from "../../ui/Select";
import {AgentComposer} from "./AgentComposer";
function openProposal(proposal:AgentProposal){
  if(!proposal.reviewHtml)return;const doc=new DOMParser().parseFromString(proposal.reviewHtml,"text/html"),script=[...doc.scripts].find(node=>node.textContent?.startsWith("window.__DH_DATA__="));
  if(script&&proposal.candidate&&proposal.page){const payload=JSON.parse(script.textContent!.slice("window.__DH_DATA__=".length).replace(/;$/,""));payload.proposal=true;payload.specs[proposal.candidate+":"+proposal.page]=proposal.spec;payload.params[proposal.candidate].css=proposal.css;script.textContent="window.__DH_DATA__="+JSON.stringify(payload).replaceAll("<","\\u003c")+";";doc.title="提案预览 · "+doc.title;}
  const url=URL.createObjectURL(new Blob(['<!doctype html>'+doc.documentElement.outerHTML],{type:"text/html"}));window.open(url,"_blank","noopener,noreferrer");setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function elapsed(start:number,end:number){const seconds=Math.max(0,Math.floor((end-start)/1000));return seconds<60?seconds+" 秒":Math.floor(seconds/60)+" 分 "+seconds%60+" 秒";}
function activityElapsed(message:AgentMessage,now:number){
  const intervals=(message.activity??[]).map(item=>[item.startedAt,item.endedAt??now]).sort((a,b)=>a[0]-b[0]);let total=0,start=0,end=0;
  for(const [a,b]of intervals){if(a>end){total+=end-start;start=a;end=b;}else end=Math.max(end,b);}return elapsed(0,total+end-start);
}
export function AgentPanel({agent,enabled,blocked,blockedReason,selection,selectionStale,onPick,onClear,onLevel}:{agent:ReturnType<typeof useAgent>;enabled:boolean;blocked:boolean;blockedReason?:string;selection:DomSelection|null;selectionStale:boolean;onPick:()=>void;onClear:()=>void;onLevel:(id:string)=>void}){
  const log=useRef<HTMLDivElement>(null),follow=useRef(true),[now,setNow]=useState(Date.now());
  useEffect(()=>{if(follow.current)log.current?.scrollTo({top:log.current.scrollHeight});},[agent.messages,agent.waiting]);
  useEffect(()=>{if(!agent.waiting&&!agent.submitting)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[agent.waiting,agent.submitting]);
  const ready=agent.job?.state==="ready",locked=agent.submitting||agent.waiting||agent.readingReferences,controls=ready?agent.job?.proposal?.controls??[]:[];
  const states:Record<string,string>={running:"正在处理",validating:"正在校验",accepting:"正在接受修改",ready:"预览待确认",accepted:"已接受",discarded:"已放弃",superseded:"已继续调整",cancelled:"已取消",failed:"处理失败",answered:"已回复"};
  return <section className="agent-panel chat-panel" aria-label="Agent">
    {enabled&&<div className="agent-sessions"><Select label="Agent 会话" value={agent.sessionId} onValueChange={id=>void agent.selectSession(id)} options={agent.sessions.map((session,index)=>({value:session.id,label:(index+1)+" · "+session.title,description:states[session.state]??"尚未发送"}))}/><button onClick={()=>void agent.newSession()} disabled={agent.creating||!agent.sessionReady}>新建会话</button></div>}
    <div className="agent-messages" role="log" aria-label="Agent 对话记录" aria-live="polite" ref={log} onScroll={()=>{const el=log.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}}>
      {agent.messages.length?agent.messages.map(message=><article key={message.id} className={"agent-message "+message.role}>
        <header><strong>{message.role==="user"?"你":message.identity?agentRoles[message.identity].label+" Agent":"Agent"}</strong>{message.startedAt&&<time dateTime={new Date(message.startedAt).toISOString()}>{new Date(message.startedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</time>}</header>
        {message.selection&&<small className="message-element">{message.selection.tag} · {message.selection.label}</small>}
        {message.role==="assistant"&&message.model&&<small className="message-model">{message.model.name} · {message.model.provider}{message.model.effort&&<> · 思考 {effortLabel(message.model.effort)}</>}</small>}{message.content&&<p>{message.content}</p>}
        {!!message.activity?.length&&<details className="agent-process" open={["running","validating","accepting"].includes(message.state??"")}><summary>处理过程 · {message.activity.length} 项{message.startedAt&&<span>{activityElapsed(message,now)}</span>}</summary><ol aria-label="实际处理活动">{message.activity.map(item=><li key={item.id} data-state={item.status}>{item.status==="running"?<span className="loading-spinner" aria-hidden="true"/>:<span className="activity-mark" aria-hidden="true">{item.status==="failed"?"!":item.status==="cancelled"?"−":"✓"}</span>}<div><span>{item.label}</span>{item.text&&<p>{item.text}</p>}</div></li>)}</ol></details>}
        {message.role==="assistant"&&message.state&&<small className="message-state">{states[message.state]??message.state}</small>}
      </article>):<div className="agent-empty"><strong>从页面开始，一起完善设计</strong><p>默认由交互设计协助，也可切换视觉设计；直接讨论目标、附加参考图或点选元素。修改先预览，接受后写入。</p></div>}
    </div>
    {locked&&<div className="agent-waiting" role="status"><span className="loading-spinner" aria-hidden="true"/><span>{agent.job?.state==="accepting"?"正在校验并接受修改":agent.job?.state==="validating"?"正在检查生成结果":agent.submitting?"正在提交请求":"Agent 正在处理"}{agent.job?.startedAt&&<> · {elapsed(agent.job.startedAt,now)}</>}</span></div>}
    {ready&&<section className="agent-result" aria-label="生成预览"><strong>{agent.job?.role?agentRoles[agent.job.role].label:"设计"}提案 · 尚未写入</strong><p>{agent.job?.summary}</p>{!agent.proposalMatches&&<p className="muted">提案属于页面 {agent.job?.page}，当前画布未展示此提案。</p>}{agent.job?.proposal?.impact?.shared.length? <p className="proposal-impact">包含需求级共享修改，影响方案：{agent.job.proposal.impact.candidates.join("、")}。共享文件：{agent.job.proposal.impact.shared.join("、")}</p>:null}{agent.job?.proposal?.reviewHtml&&<button disabled={locked} onClick={()=>openProposal(tuneProposal(agent.job!.proposal!,agent.values))}>打开完整提案预览</button>}{controls.length>0&&<div className="parameter-grid" role="group" aria-label="本次生成的调整项">{controls.map(c=><label className="parameter" key={c.id}><span>{c.label}<output>{String(agent.values[c.id]??"")}{c.unit}</output></span>{c.type==="range"?<input aria-label={c.label} disabled={locked} type="range" min={c.min} max={c.max} step={c.step} value={Number(agent.values[c.id])} onChange={e=>agent.tune(c.id,Number(e.target.value))}/>:c.type==="boolean"?<input aria-label={c.label} type="checkbox" disabled={locked} checked={Boolean(agent.values[c.id])} onChange={e=>agent.tune(c.id,e.target.checked)}/>:<input aria-label={c.label} type="text" disabled={locked} maxLength={2000} value={String(agent.values[c.id])} onChange={e=>agent.tune(c.id,e.target.value)}/>}</label>)}</div>}<div className="agent-actions"><button className="primary" disabled={blocked||locked} onClick={()=>void agent.finish("accept")}>接受修改</button><button disabled={locked} onClick={()=>void agent.finish("discard")}>放弃预览</button></div><details><summary>查看修改文件（{agent.job?.proposal?.changes.length}）</summary>{agent.job?.proposal?.changes.map(c=><details key={c.path}><summary>{c.path}</summary><h4>修改前</h4><pre>{c.before??"新建文件"}</pre><h4>修改后</h4><pre>{c.after}</pre></details>)}</details></section>}
    <AgentComposer agent={agent} enabled={enabled} blocked={blocked} selection={selection} selectionStale={selectionStale} onPick={onPick} onClear={onClear} onLevel={onLevel} onSubmit={()=>{follow.current=true;void agent.generate();}}/>
    {blocked&&<p className="muted">{blockedReason??"请先完成当前保存或页面切换。"}</p>}
    {(agent.error||agent.job?.error)&&<p role="alert" className="validation-warning">{agent.error||agent.job?.error}</p>}
  </section>;
}
