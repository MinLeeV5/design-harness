import {useEffect, useState} from "react";
import type {PageProps} from "../../../../studio/types";
import {Button, Surface} from "../../foundation/components";
import "../../foundation/tokens.css";
import "./task.css";

export default function TaskPage({scenario}: PageProps) {
  const [phase, setPhase] = useState(String(scenario.state.phase ?? "new"));
  const [topic, setTopic] = useState(String(scenario.state.topic ?? ""));
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (phase !== "running") return;
    setProgress(0);
    const first = setTimeout(() => setProgress(1), 600);
    const second = setTimeout(() => setProgress(2), 1200);
    const done = setTimeout(() => setPhase("complete"), 1900);
    return () => { clearTimeout(first); clearTimeout(second); clearTimeout(done); };
  }, [phase]);
  function start() {
    if (!topic.trim()) {setError("请填写任务主题"); return;}
    setError(""); setPhase("running");
  }
  const report = "资料整理结果\n\n主题：" + topic + "\n\n已整理三组资料，并生成待核对摘要。\n此内容为设计示例。";
  return <main className="task-page">
    <header className="product-header"><span className="product-mark" aria-hidden="true">◇</span><strong>资料工作室</strong><span>任务整理</span></header>
    <div className="task-layout">
      <aside className="task-nav"><h2>我的任务</h2><button onClick={() => {setPhase("new"); setError("");}}>＋ 新建整理</button>
        <div className="task-history"><small>当前任务</small><p>{topic || "尚未填写主题"}</p><span>{({new:"待开始",running:"整理中",complete:"已完成",error:"待恢复"} as Record<string,string>)[phase]}</span></div>
        <p className="muted">合成数据 · 本地演示</p></aside>
      <section className="task-main">
        <div className="task-heading"><p className="eyebrow">从一个明确目标开始</p><h1>把零散资料，整理成清晰结果。</h1><p className="muted">交代需要整理的主题，在这里查看进展和材料。</p></div>
        <div data-dh-id="task-form"><Surface>
          <label htmlFor="topic" className="field-label">任务主题 <span aria-hidden="true">*</span></label>
          <input id="topic" aria-required="true" aria-invalid={!!error} aria-describedby={error ? "topic-error" : undefined} value={topic}
            disabled={phase === "running"} placeholder="例如：整理下一次课程的参考资料" onChange={e => {setTopic(e.target.value); setError("");}}/>
          {error && <p id="topic-error" role="alert" className="error">{error}</p>}
          <p className="muted field-help">写清对象和目标，让整理结果更容易判断。</p>
          <div className="form-footer"><span>示例任务仅在本地运行</span><Button data-dh-id="task-submit" disabled={phase === "running"} onClick={start}>{phase === "running" ? "正在整理…" : "开始整理"}</Button></div>
        </Surface></div>
        {phase === "running" && <section data-dh-id="task-progress" aria-live="polite" className="result-block">
          <h2>正在整理资料</h2><ol className="progress-list">{["接收任务","归纳资料","生成结果"].map((step,i) => <li key={step} className={i<=progress ? "active" : ""}><span>{i < progress ? "✓" : i+1}</span>{step}</li>)}</ol></section>}
        {phase === "error" && <section data-dh-id="task-error" role="alert" className="result-block"><h2>整理暂时中断</h2><p>你的主题已保留，可以重新开始本次整理。</p><Button onClick={start}>重新整理</Button></section>}
        {phase === "complete" && <section data-dh-id="task-result" className="result-block">
          <div className="result-title"><div><p className="eyebrow">整理已完成</p><h2>{topic}</h2></div><span className="success">可查看结果</span></div>
          <p>已将参考资料归纳为三个主题，并保留需要进一步核对的内容。</p>
          <div className="report-card"><div><strong>整理摘要.txt</strong><p className="muted">本地示例材料 · 文本</p></div><div className="report-actions"><button onClick={() => setPreview(v=>!v)}>{preview ? "收起预览" : "预览材料"}</button><a href={"data:text/plain;charset=utf-8,"+encodeURIComponent(report)} download="整理摘要.txt">下载材料</a></div></div>
          {preview && <pre className="report-preview">{report}</pre>}
        </section>}
      </section>
    </div>
  </main>;
}
