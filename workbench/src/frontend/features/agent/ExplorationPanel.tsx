import {useState} from "react";
import {Select} from "../../ui/Select";
import type {useAgent} from "./use-agent";
import "./exploration.css";

export const optionStatus=(state:string)=>({queued:"等待生成",running:"正在生成",validating:"正在验证",ready:"可查看",failed:"生成失败",cancelled:"已停止"}[state]??state);
export function ExplorationPanel({agent}:{agent:ReturnType<typeof useAgent>}){
  const [deleting,setDeleting]=useState("");
  const group=agent.exploring?agent.job?.exploration:undefined,locked=agent.waiting||agent.submitting,history=agent.history?.groups??[];
  if(!group&&!history.length&&!agent.historyError)return null;
  return <section className="exploration-result" aria-label="设计方案">
    {group&&<><strong>{group.phase==="discussing"?"讨论设计方向":"方案比较"} · {group.options.length?group.options.filter(option=>option.proposal).length+"/"+group.options.length+" 已就绪":group.count+" 个方案"}</strong>
      {!group.options.length&&<><p>与主 Agent 确定目标、保留内容和本轮范围。</p>{group.plan?.directions.length?<ol className="exploration-directions">{group.plan.directions.map((direction,index)=><li key={index}><b>{direction.title}</b><p>{direction.brief}</p></li>)}</ol>:null}{group.plan?.ready&&group.plan.operation==="explore"&&<button className="primary" disabled={locked} onClick={()=>void agent.explorationAction("confirm")}>确认生成 {group.count} 个方案</button>}</>}
      {!!group.options.length&&<><p>在主画布独立体验；直接描述取舍，或点选多个方案加入草稿。</p><ul>{group.options.map(option=><li key={option.id} data-option-result={option.id}><div><b>{option.label} · {option.title}</b><small>{optionStatus(option.state)}</small></div>{option.error&&<p role="status">{option.error}</p>}{option.versions.length>1&&<Select label={option.label+" 的版本"} value={option.version??option.versions.at(-1)!.id} disabled={locked} options={option.versions.map(version=>({value:version.id,label:"版本 "+version.number,description:version.summary}))} onValueChange={version=>void agent.explorationAction("version",option.id,version)}/>}<div className="agent-actions">{option.proposal&&<button type="button" disabled={agent.submitting||option.state!=="ready"} aria-pressed={(group.selected??group.focused)===option.id} onClick={()=>void agent.explorationAction("select",option.id)}>{(group.selected??group.focused)===option.id?"当前方案 "+option.label:"使用方案 "+option.label}</button>}{option.state==="failed"&&!option.versions.length&&<button type="button" disabled={locked} onClick={()=>void agent.explorationAction("retry",option.id)}>重试方案 {option.label}</button>}</div></li>)}</ul><button type="button" disabled={locked||!group.options.some(option=>option.proposal)} onClick={()=>void agent.explorationAction("reexplore")}>基于当前方案再探索 · {agent.optionCount} 个方案</button></>}
      <div className="agent-actions"><button type="button" disabled={locked} onClick={()=>void agent.finish("discard")}>结束本轮 · 保留历史</button></div>
    </>}
    {!!history.length&&<details className="exploration-history"><summary>方案历史 · {history.length} 轮</summary><ul>{[...history].reverse().map((round,index)=><li key={round.id}><div><b>{round.parent?"基于 "+round.parent.label+" 再探索":"设计探索"} · {round.options.length||round.count} 个方案</b><small>{new Date(round.createdAt).toLocaleDateString("zh-CN")}</small></div><p>{round.conclusions??round.summary}</p><div className="agent-actions"><button disabled={locked} onClick={()=>void agent.openExploration(round.id)}>打开第 {history.length-index} 轮</button><button disabled={agent.submitting} onClick={()=>setDeleting(round.id)}>删除此轮</button></div>{deleting===round.id&&<div role="group" aria-label="确认删除方案历史"><p>删除此轮及其所有版本，已接受的正式设计和其他轮次保留。</p><button disabled={agent.submitting} onClick={()=>{void agent.deleteExploration(round.id);setDeleting("");}}>确认删除</button><button onClick={()=>setDeleting("")}>取消</button></div>}</li>)}</ul></details>}
    {agent.historyError&&<p role="alert">{agent.historyError}<button onClick={()=>void agent.refreshHistory()}>重试读取历史</button></p>}
  </section>;
}
