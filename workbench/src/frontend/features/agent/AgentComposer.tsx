import {useRef} from "react";
import type {useAgent} from "./use-agent";
import type {DomSelection,AgentPermissionMode} from "../../../contracts/types";
import {permissionModes} from "../../../contracts/agent-permissions.mjs";
import {Select} from "../../ui/Select";
import {ModelSettings} from "./ModelSettings";
import {effortLabel} from "../../../contracts/agent-settings.mjs";
import {AgentIcon as Icon,type IconName} from "./AgentIcon";

const permissionIcons:Record<AgentPermissionMode,IconName>={"read-only":"permission-read",proposal:"permission-proposal","full-access":"permission-full"};
export function AgentComposer({agent,enabled,blocked,selection,selectionStale,onPick,onClear,onLevel,onSubmit}:{agent:ReturnType<typeof useAgent>;enabled:boolean;blocked:boolean;selection:DomSelection|null;selectionStale:boolean;onPick:()=>void;onClear:()=>void;onLevel:(id:string)=>void;onSubmit:()=>void}) {
  const upload=useRef<HTMLInputElement>(null);
  const locked=agent.submitting||agent.waiting||agent.readingReferences,ready=agent.job?.state==="ready",connection=agent.connection;
  const model=connection?.models.find(item=>item.id===agent.model),defaultModel=connection?.models.find(item=>item.id===connection.defaultModel);
  const activeModel=model||defaultModel,automaticEffort=activeModel?.efforts.includes(connection?.defaultEffort??"")?connection?.defaultEffort:activeModel?.defaultEffort;
  const modelLabel=agent.model?model?.name||agent.model:defaultModel?.name||connection?.defaultModel||"本机默认";
  const canSend=(!ready||agent.proposalMatches)&&agent.sessionReady&&!agent.savingSettings&&!blocked&&!locked&&!!agent.identity&&!!agent.prompt.trim()&&!!connection?.available&&connection.auth!=="required"&&!agent.checkingConnection&&!agent.connectionError;
  return <div className="agent-compose-area">
    {selection&&<div className="element-selection composer-selection"><div className="element-chip"><Icon name="pick"/><strong title={selection.tag+" · "+selection.label}>{selection.tag} · {selection.label}</strong><button type="button" className="composer-icon" aria-label="移除元素上下文" title="移除元素上下文" onClick={onClear} disabled={locked}><Icon name="close"/></button></div><div className="composer-level"><Select label="选择元素层级" value={selection.domId} disabled={locked||selectionStale} onValueChange={onLevel} options={selection.ancestors.map(a=>({value:a.domId,label:a.label}))}/></div>{selection.instance&&<small>当前重复项 {selection.instance}</small>}{selectionStale&&<small>画面已更新，重新点选可更新元素层级。</small>}</div>}
    {!!agent.references.length&&<div className="design-references">{agent.references.map(reference=><div className="design-reference" key={reference.id}><img src={reference.data} alt={reference.name}/><span>{reference.name}</span><button type="button" className="composer-icon" aria-label={"移除参考图 · "+reference.name} title="移除参考图" disabled={locked} onClick={()=>agent.removeReference(reference.id)}><Icon name="close"/></button></div>)}</div>}
    {enabled?<>
      <form className="agent-composer" onSubmit={event=>{event.preventDefault();if(canSend)onSubmit();}}>
        <label className="sr-only" htmlFor="agent-prompt">发给 Agent</label><textarea id="agent-prompt" rows={3} value={agent.prompt} disabled={locked} onChange={e=>agent.setPrompt(e.target.value)} placeholder="讨论设计，或描述想调整的地方…"/>
        <div className="composer-toolbar" role="group" aria-label="Agent 输入工具">
          <div className="composer-tools">
            <button type="button" className="composer-icon" aria-label="点选元素" title="点选元素" onClick={onPick} disabled={locked}><Icon name="pick"/></button>
            <button type="button" className="composer-icon" aria-label="添加参考图" title="添加参考图" disabled={locked||agent.references.length>=3} onClick={()=>upload.current?.click()}><Icon name="image"/></button>
            <input className="sr-only" ref={upload} aria-label="参考图文件" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={locked||agent.references.length>=3} onChange={e=>{void agent.addReferences(e.target.files);e.target.value="";}}/>
            <ModelSettings agent={agent} modelLabel={modelLabel} disabled={locked||!agent.sessionReady} modelDisabled={agent.checkingConnection||!connection?.available} effortDisabled={agent.checkingConnection||!activeModel?.efforts.length} fullAccessIcon={<Icon name="permission-full"/>}
              modelOptions={[{value:"",label:"跟随本机配置",description:defaultModel?.name||connection?.defaultModel||"使用本机默认模型"},...(agent.model&&!model?[{value:agent.model,label:agent.model,description:"已不在目录中，请刷新后重新选择",disabled:true}]:[]),...(connection?.models??[]).map(item=>({value:item.id,label:item.name,keywords:item.id,description:!item.images?"不支持图片，无法接收当前设计画面":item.isDefault?"本机默认模型，支持图片，可接收当前画面和参考图":"支持图片，可接收当前画面和参考图",descriptionIcon:<Icon name={item.images?"image":"image-off"}/>,disabled:!item.images}))]}
              effortOptions={[{value:"",label:"自动",description:automaticEffort?"当前默认："+effortLabel(automaticEffort):"跟随本机与模型默认设置"},...(activeModel?.efforts??[]).map(value=>({value,label:effortLabel(value)}))]}
              permissionOptions={permissionModes.map(mode=>({...mode,icon:<Icon name={permissionIcons[mode.value]}/>}))}/>
          </div>
          {agent.waiting&&agent.job?.state!=="accepting"?<button type="button" className="composer-submit composer-stop" aria-label="取消生成" title="停止生成" disabled={agent.submitting} onClick={()=>void agent.finish("cancel")}><Icon name="stop"/></button>:<button type="submit" className="composer-submit" aria-label="发送" title="发送" disabled={!canSend}>{locked?<span className="loading-spinner" aria-hidden="true"/>:<Icon name="send"/>}</button>}
        </div>
      </form>
      <small className="composer-hint">{!agent.sessionReady?"正在恢复当前方案的会话…":agent.savingSettings?"正在记住选择…":ready?"接受或放弃提案后可切换身份":agent.permissionMode==="full-access"?"当前画面随消息发送":"当前画面随消息发送 · 接受后写入"}</small>
      {agent.depthNotice&&<small className="settings-notice" role="status">{agent.depthNotice}</small>}
      {agent.settingsError&&<div className="settings-notice" role="alert"><span>{agent.settingsError}</span><button type="button" disabled={agent.savingSettings||locked} onClick={agent.retrySettings}>重试保存</button></div>}
    </>:<div className="agent-offline-compose"><button type="button" className="composer-icon" aria-label="点选元素" title="点选元素" onClick={onPick}><Icon name="pick"/></button><p className="muted">离线预览可阅读与点选；生成和聊天需要本地插件工作台。</p></div>}
  </div>;
}
