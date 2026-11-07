import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {ExplorationPanel} from "./ExplorationPanel";
import type {AgentMessage,AgentProposal,AgentApproval,DomSelection} from "../../../contracts/types";
import {tuneProposal} from "../../../contracts/agent-controls.mjs";
import {effortLabel} from "../../../contracts/agent-settings.mjs";
import {agentRoles} from "../../../contracts/agent-roles.mjs";
import {permissionLabel,fullAccessWarning} from "../../../contracts/agent-permissions.mjs";
import type {useAgent} from "./use-agent";
import {Select} from "../../ui/Select";
import {AgentComposer} from "./AgentComposer";
import {AgentIcon} from "./AgentIcon";
import {AgentStatus} from "./AgentStatus";
import {Markdown} from "../../ui/Markdown";
function DirectoryPath({path}:{path:string}){
  const label=useRef<HTMLSpanElement>(null),[display,setDisplay]=useState(path);
  useLayoutEffect(()=>{
    const node=label.current,context=document.createElement("canvas").getContext("2d");if(!node||!context)return;
    const characters=Array.from(path);
    const compact=(length:number)=>{const head=Math.ceil(length/2),tail=length-head;return characters.slice(0,head).join("")+"..."+(tail?characters.slice(-tail).join(""):"");};
    const update=()=>{
      const width=node.clientWidth;if(!width)return;context.font=getComputedStyle(node).font;
      if(context.measureText(path).width<=width){setDisplay(path);return;}
      let low=0,high=characters.length-1;
      while(low<high){const middle=Math.ceil((low+high)/2);if(context.measureText(compact(middle)).width<=width)low=middle;else high=middle-1;}
      setDisplay(compact(low));
    };
    update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();
  },[path]);
  return <small className="agent-directory" title={path}><span>目录：</span><span className="agent-directory-path" ref={label}>{display}</span></small>;
}
function ApprovalCard({approval,agent}:{approval:AgentApproval;agent:ReturnType<typeof useAgent>}){
  const [values,setValues]=useState<Record<string,string|boolean>>({});
  const pending=approval.state==="pending"&&agent.job?.approvals?.some(item=>item.id===approval.id&&item.state==="pending");
  const set=(id:string,value:string|boolean)=>setValues(previous=>({...previous,[id]:value}));
  function decide(choice:"accept"|"decline"|"cancel"){
    const content=approval.fields?Object.fromEntries(approval.fields.flatMap(field=>{
      const value=values[field.id];if(field.type==="boolean")return [[field.id,value===true]];
      if(value===undefined)return field.type==="string"&&field.required&&!(field.minLength??0)?[[field.id,""]]:[];
      if(value===""&&field.type!=="string")return [];
      return [[field.id,field.type==="number"||field.type==="integer"?Number(value):value]];
    })):undefined;void agent.decideApproval(approval.id,choice,content);
  }
  if(approval.kind==="command"&&!pending){
    const result=({accepted:"已批准",declined:"已拒绝",cancelled:"已取消",pending:"已结束"})[approval.state];
    return <small className="agent-approval-result" aria-label={(approval.command?approval.command+" ":"")+"命令"+result}>{approval.command&&<span className="approval-command" title={approval.command}>{approval.command}</span>}<AgentStatus state={approval.state==="pending"?"ended":approval.state} label={"命令"+result}/></small>;
  }
  return <section className="agent-approval" aria-label={approval.title} data-agent-approval-id={pending?approval.id:undefined} tabIndex={pending?-1:undefined}>
    <header className="agent-approval-heading"><AgentStatus state={pending?"awaiting_approval":approval.state==="pending"?"ended":approval.state} iconOnly decorative/><strong>{approval.title}</strong></header>{approval.reason&&<p>{approval.reason}</p>}{approval.command&&<pre>{approval.command}</pre>}{approval.cwd&&<DirectoryPath path={approval.cwd}/>}{approval.details&&<pre>{approval.details}</pre>}
    {pending&&approval.url&&<a href={approval.url} target="_blank" rel="noopener noreferrer">打开工具授权页面</a>}
    {pending&&approval.fields?.map(field=><label className="approval-field" key={field.id}><span>{field.label}{field.required?"（必填）":""}</span>{field.options?<Select label={field.label} value={String(values[field.id]??"")} options={field.options.map(option=>({value:option.value,label:option.label}))} onValueChange={value=>set(field.id,value)} disabled={agent.submitting}/>:field.type==="boolean"?<input type="checkbox" checked={values[field.id]===true} onChange={event=>set(field.id,event.target.checked)} disabled={agent.submitting}/>:<input type={field.type==="string"?"text":"number"} value={String(values[field.id]??"")} maxLength={field.maxLength??16000} minLength={field.minLength} min={field.minimum} max={field.maximum} step={field.type==="integer"?1:"any"} onChange={event=>set(field.id,event.target.value)} disabled={agent.submitting}/>}<small>{field.description}</small></label>)}
    {pending&&<small>批准可能允许操作超出当前沙箱。涉及源文件或外部服务的修改不会随放弃提案撤销。</small>}
    {pending?<div className="agent-actions">{approval.choices.map(choice=><button key={choice} className={choice==="accept"?"approval-accept":undefined} disabled={agent.submitting} onClick={()=>decide(choice)}>{({accept:"批准本次",decline:"拒绝",cancel:"取消操作"})[choice]}</button>)}</div>:<AgentStatus state={approval.state==="pending"?"ended":approval.state} label={({accepted:"已批准",declined:"已拒绝",cancelled:"已取消",pending:"已结束"})[approval.state]}/>}
  </section>;
}
function openProposal(proposal:AgentProposal){
  if(!proposal.reviewHtml)return;const doc=new DOMParser().parseFromString(proposal.reviewHtml,"text/html"),script=[...doc.scripts].find(node=>node.textContent?.startsWith("window.__DH_DATA__="));
  if(script&&proposal.candidate&&proposal.page){const payload=JSON.parse(script.textContent!.slice("window.__DH_DATA__=".length).replace(/;$/,""));payload.proposal=true;payload.proposalPermission=proposal.permissionMode;payload.specs[proposal.candidate+":"+proposal.page]=proposal.spec;payload.params[proposal.candidate].css=proposal.css;script.textContent="window.__DH_DATA__="+JSON.stringify(payload).replaceAll("<","\\u003c")+";";doc.title="提案预览 · "+doc.title;}
  const url=URL.createObjectURL(new Blob(['<!doctype html>'+doc.documentElement.outerHTML],{type:"text/html"}));window.open(url,"_blank","noopener,noreferrer");setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function elapsed(start:number,end:number){const seconds=Math.max(0,Math.floor((end-start)/1000));return seconds<60?seconds+" 秒":Math.floor(seconds/60)+" 分 "+seconds%60+" 秒";}
function activityElapsed(message:AgentMessage,now:number){
  const intervals=(message.activity??[]).map(item=>[item.startedAt,item.endedAt??now]).sort((a,b)=>a[0]-b[0]);let total=0,start=0,end=0;
  for(const [a,b]of intervals){if(a>end){total+=end-start;start=a;end=b;}else end=Math.max(end,b);}return elapsed(0,total+end-start);
}
export function AgentPanel({agent,enabled,blocked,blockedReason,selection,selectionStale,onPick,onClear,onLevel}:{agent:ReturnType<typeof useAgent>;enabled:boolean;blocked:boolean;blockedReason?:string;selection:DomSelection|null;selectionStale:boolean;onPick:()=>void;onClear:()=>void;onLevel:(id:string)=>void}){
  const log=useRef<HTMLDivElement>(null),contents=useRef<HTMLDivElement>(null),follow=useRef(true),[atBottom,setAtBottom]=useState(true),[approvalTarget,setApprovalTarget]=useState(""),[now,setNow]=useState(Date.now());
  const pendingApprovals=agent.job?.approvals?.filter(item=>item.state==="pending")??[];
  function syncScroll(){const node=log.current;if(!node)return;const nearBottom=node.scrollHeight-node.scrollTop-node.clientHeight<70;follow.current=nearBottom;setAtBottom(nearBottom);}
  function scrollToLatest(){follow.current=true;log.current?.scrollTo({top:log.current.scrollHeight,behavior:"instant"});setAtBottom(true);}
  function focusApproval(){
    const node=log.current,target=node?.querySelector<HTMLElement>("[data-agent-approval-id]");if(!node||!target)return false;
    follow.current=false;node.scrollTo({top:node.scrollTop+target.getBoundingClientRect().top-node.getBoundingClientRect().top-8,behavior:"instant"});target.focus({preventScroll:true});syncScroll();return true;
  }
  function viewApproval(){
    if(pendingApprovals.length){focusApproval();return;}
    const session=agent.approvalSessions[0];if(session){setApprovalTarget(session.id);void agent.selectSession(session.id);}
  }
  useLayoutEffect(()=>{follow.current=true;setAtBottom(true);},[agent.sessionId]);
  useLayoutEffect(()=>{if(follow.current)scrollToLatest();else syncScroll();},[agent.messages,agent.waiting]);
  useLayoutEffect(()=>{
    const node=log.current,body=contents.current;if(!node||!body)return;
    const observer=new ResizeObserver(()=>{if(follow.current)scrollToLatest();else syncScroll();});observer.observe(node);observer.observe(body);return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{if(approvalTarget&&approvalTarget!==agent.sessionId)setApprovalTarget("");else if(approvalTarget&&focusApproval())setApprovalTarget("");},[approvalTarget,agent.sessionId,agent.messages]);
  useEffect(()=>{if(!agent.waiting&&!agent.submitting)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[agent.waiting,agent.submitting]);
  const ready=agent.job?.state==="ready",locked=agent.submitting||agent.waiting||agent.readingReferences,controls=ready&&(agent.job?.exploration||agent.job?.proposal?.page===agent.currentPage)?agent.job?.proposal?.controls??[]:[];
  return <section className="agent-panel chat-panel" aria-label="Agent">
    <div className="agent-conversation">
    <div className="agent-messages" role="log" aria-label="Agent 对话记录" aria-live="polite" tabIndex={0} ref={log} onScroll={syncScroll} onWheel={event=>{if(event.deltaY<0)follow.current=false;}}>
      <div className="agent-message-list" ref={contents}>
      {agent.messages.length?agent.messages.map(message=><article key={message.id} className={"agent-message "+message.role}>
        <header><strong>{message.role==="user"?"你":message.identity?agentRoles[message.identity].label+" Agent":"Agent"}</strong>{message.startedAt&&<time dateTime={new Date(message.startedAt).toISOString()}>{new Date(message.startedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</time>}</header>
        {message.selection&&<small className="message-element">{message.selection.tag} · {message.selection.label}</small>}
        {message.role==="assistant"&&message.model&&<small className="message-model">{message.model.name} · {message.model.provider}{message.model.effort&&<> · 思考 {effortLabel(message.model.effort)}</>}{message.permissionMode&&<> · {permissionLabel(message.permissionMode)}</>}</small>}{message.content&&<Markdown source={message.content}/>}
        {message.permissionMode==="full-access"&&message.role==="assistant"&&<small className="message-permission">本轮使用完全访问；放弃或取消不会撤销直接修改。</small>}
        {!!message.activity?.length&&<details className="agent-process" open={["running","validating","accepting"].includes(message.state??"")}><summary>处理过程 · {message.activity.length} 项{message.startedAt&&<span>{activityElapsed(message,now)}</span>}</summary><ol aria-label="实际处理活动">{message.activity.map(item=><li key={item.id} data-state={item.status}><AgentStatus state={item.status} iconOnly decorative className="activity-mark"/><div><span>{item.label}</span>{item.text&&<Markdown source={item.text}/>}{item.command&&<pre className="agent-command">{item.command}</pre>}{item.cwd&&<DirectoryPath path={item.cwd}/>}{item.output&&<details className="agent-output"><summary>查看输出{item.exitCode!==undefined?" · 退出码 "+item.exitCode:""}</summary><pre>{item.output}</pre>{item.truncated&&<small>输出较长，已截断。</small>}</details>}{!item.output&&item.exitCode!==undefined&&<small>退出码 {item.exitCode}</small>}</div></li>)}</ol></details>}
        {message.approvals?.map(approval=><ApprovalCard key={approval.id} approval={approval} agent={agent}/>)}
        {message.role==="assistant"&&message.state&&<small className="message-state"><AgentStatus state={message.approvals?.some(item=>pendingApprovals.some(pending=>pending.id===item.id))?"awaiting_approval":message.state}/></small>}
      </article>):<div className="agent-empty"><strong>从页面开始，一起完善设计</strong><p>默认由交互设计协助，也可切换视觉设计；直接讨论目标、附加参考图或点选元素。提案工作区中的修改先预览，接受后写入。</p></div>}
      </div>
    </div>
    {!atBottom&&<button type="button" className="agent-scroll-latest" title="滚动到底部并跟随最新消息" onClick={()=>{scrollToLatest();log.current?.focus({preventScroll:true});}}><AgentIcon name="bottom"/>回到最新</button>}
    </div>
    {locked&&!pendingApprovals.length&&<div className="agent-waiting" role="status"><AgentStatus state={agent.job?.state==="accepting"?"accepting":agent.job?.state==="validating"?"validating":"running"} label={agent.job?.state==="accepting"?"正在校验并接受修改":agent.job?.state==="validating"?"正在检查生成结果":agent.submitting?"正在提交请求":"Agent 正在处理"}/>{agent.job?.startedAt&&<time aria-label={"本轮已用时 "+elapsed(agent.job.startedAt,now)}>{elapsed(agent.job.startedAt,now)}</time>}</div>}
    <ExplorationPanel agent={agent}/>
    {ready&&Boolean(agent.job?.proposal)&&<section className="agent-result" aria-label="生成预览"><strong>{agent.job?.role?agentRoles[agent.job.role].label:"设计"}提案 · {agent.job?.permissionMode==="full-access"?"完全访问":"尚未写入"}</strong><Markdown source={agent.job?.summary??""}/>{agent.job?.permissionMode==="full-access"&&<p className="agent-permission-warning">{fullAccessWarning}</p>}{agent.job?.sourceChanged&&<p className="agent-permission-warning">源资源在本轮处理期间发生变化，接受时仍会检查版本。放弃提案不会撤销已有源文件修改。</p>}{!agent.proposalMatches&&<p className="muted">提案属于页面 {agent.job?.page}，当前画布未展示此提案。</p>}{agent.job?.proposal?.impact?.shared.length? <p className="proposal-impact">包含需求级共享修改，影响方案：{agent.job.proposal.impact.candidates.join("、")}。共享文件：{agent.job.proposal.impact.shared.join("、")}</p>:null}{agent.job?.proposal?.reviewHtml&&<button disabled={locked} onClick={()=>openProposal(tuneProposal(agent.job!.proposal!,agent.values))}>打开完整提案预览</button>}{controls.length>0&&<div className="parameter-grid" role="group" aria-label="本次生成的调整项">{controls.map(c=><label className="parameter" key={c.id}><span>{c.label}<output>{String(agent.values[c.id]??"")}{c.unit}</output></span>{c.type==="range"?<input aria-label={c.label} disabled={locked} type="range" min={c.min} max={c.max} step={c.step} value={Number(agent.values[c.id])} onChange={e=>agent.tune(c.id,Number(e.target.value))}/>:c.type==="boolean"?<input aria-label={c.label} type="checkbox" disabled={locked} checked={Boolean(agent.values[c.id])} onChange={e=>agent.tune(c.id,e.target.checked)}/>:<input aria-label={c.label} type="text" disabled={locked} maxLength={2000} value={String(agent.values[c.id])} onChange={e=>agent.tune(c.id,e.target.value)}/>}</label>)}</div>}<div className="agent-actions"><button className="primary" disabled={blocked||locked} onClick={()=>void agent.finish("accept")}>接受修改</button>{!agent.job?.exploration&&<button disabled={locked} onClick={()=>void agent.finish("discard")}>放弃预览</button>}</div><details><summary>查看修改文件（{agent.job?.proposal?.changes.length}）</summary>{agent.job?.proposal?.changes.map(c=><details key={c.path}><summary>{c.path}</summary><h4>修改前</h4><pre>{c.before??"新建文件"}</pre><h4>修改后</h4><pre>{c.after}</pre></details>)}</details></section>}
    {(pendingApprovals.length>0||agent.approvalSessions.length>0)&&<div className="agent-approval-notice" role="status" aria-label="待审批提示"><AgentStatus state="awaiting_approval" iconOnly decorative/><span className="agent-approval-notice-copy"><strong>等待你审批</strong><small>{pendingApprovals.length?"当前会话 "+pendingApprovals.length+" 项操作待确认":agent.approvalSessions.length+" 个其他会话待确认"}</small></span><button type="button" onClick={viewApproval} disabled={agent.submitting}>查看审批</button></div>}
    <AgentComposer agent={agent} enabled={enabled} blocked={blocked} selection={selection} selectionStale={selectionStale} onPick={onPick} onClear={onClear} onLevel={onLevel} onSubmit={()=>{follow.current=true;void agent.generate();}}/>
    {blocked&&<p className="muted">{blockedReason??"请先完成当前保存或页面切换。"}</p>}
    {(agent.error||agent.job?.error)&&<p role="alert" className="validation-warning">{agent.error||agent.job?.error}</p>}
  </section>;
}
