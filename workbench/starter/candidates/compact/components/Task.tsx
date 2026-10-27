import {useEffect,useState,type CSSProperties} from "react";
import {useStateStore} from "@json-render/react";
import {designPart,type BaseComponentProps} from "@design-harness/preview";
import {Button} from "@design-harness/foundation/components";
import "@design-harness/foundation/tokens.css";
import "./task.css";
export function TaskWorkspace({props,children}:BaseComponentProps<{title:string}>) {
  const {state,set}=useStateStore(),phase=String(state.phase??"new"),topic=String(state.topic??"");
  return <main className="task-page"><header className="product-header"><span className="product-mark" aria-hidden="true">◇</span><strong>资料工作室</strong><span>任务整理</span></header>
    <div className="task-layout"><aside className="task-nav"><h2>我的任务</h2><button onClick={()=>set("/phase","new")}>＋ 新建整理</button><div className="task-history"><small>当前任务</small><p>{topic||"尚未填写主题"}</p><span>{({new:"待开始",running:"整理中",complete:"已完成",error:"待恢复"} as Record<string,string>)[phase]}</span></div></aside>
    <section className="task-main"><div className="task-heading"><p className="eyebrow">从一个明确目标开始</p><h1>{props.title}</h1><p className="muted">交代需要整理的主题，在这里查看进展和材料。</p></div>{children}</section></div></main>;
}
export function TaskForm({props,emit}:BaseComponentProps<{radius:number;gap:number}>) {
  const {state,set}=useStateStore(),[error,setError]=useState("");const topic=String(state.topic??""),running=state.phase==="running";
  function start(){if(!topic.trim()){setError("请填写任务主题");return;}setError("");emit("submit");}
  return <section className="product-surface" style={{"--card-radius":props.radius+"px","--content-gap":props.gap+"px"} as CSSProperties}><label htmlFor="topic" className="field-label">任务主题 <span aria-hidden="true">*</span></label>
    <input id="topic" aria-required="true" aria-invalid={!!error} aria-describedby={error?"topic-error":undefined} value={topic} disabled={running} placeholder="例如：整理下一次课程的参考资料" onChange={e=>{set("/topic",e.target.value);setError("");}}/>
    {error&&<p id="topic-error" role="alert" className="error">{error}</p>}<p className="muted field-help">写清对象和目标，让整理结果更容易判断。</p>
    <div className="form-footer"><span>示例任务仅在本地运行</span><Button {...designPart("submit")} disabled={running} onClick={start}>{running?"正在整理…":"开始整理"}</Button></div></section>;
}
export function TaskProgress() {
  const {set}=useStateStore(),[progress,setProgress]=useState(0);
  useEffect(()=>{const first=setTimeout(()=>setProgress(1),350),second=setTimeout(()=>setProgress(2),700),done=setTimeout(()=>set("/phase","complete"),1100);return()=>{clearTimeout(first);clearTimeout(second);clearTimeout(done);};},[set]);
  return <section className="result-block" aria-live="polite"><h2>正在整理资料</h2><ol className="progress-list">{["接收任务","归纳资料","生成结果"].map((step,i)=><li key={step} className={i<=progress?"active":""}><span>{i<progress?"✓":i+1}</span>{step}</li>)}</ol></section>;
}
export function TaskError({emit}:BaseComponentProps) {return <section className="result-block" role="alert"><h2>整理暂时中断</h2><p>你的主题已保留，可以重新开始本次整理。</p><Button onClick={()=>emit("retry")}>重新整理</Button></section>;}
export function TaskResult() {
  const {state}=useStateStore(),[preview,setPreview]=useState(false),topic=String(state.topic??"");const report="资料整理结果\n\n主题："+topic+"\n\n已整理三组资料，并生成待核对摘要。\n此内容为设计示例。";
  return <section className="result-block"><div className="result-title"><div><p className="eyebrow">整理已完成</p><h2>{topic}</h2></div><span className="success">可查看结果</span></div><p>已将参考资料归纳为三个主题，并保留需要进一步核对的内容。</p><div className="report-card"><div><strong>整理摘要.txt</strong><p className="muted">本地示例材料 · 文本</p></div><div className="report-actions"><button onClick={()=>setPreview(v=>!v)}>{preview?"收起预览":"预览材料"}</button><a href={"data:text/plain;charset=utf-8,"+encodeURIComponent(report)} download="整理摘要.txt">下载材料</a></div></div>{preview&&<pre className="report-preview">{report}</pre>}</section>;
}
