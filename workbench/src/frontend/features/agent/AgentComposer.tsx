import {useRef,useState,type ReactNode} from "react";
import type {useAgent} from "./use-agent";
import type {DomSelection,AgentPermissionMode} from "../../../contracts/types";
import {permissionModes} from "../../../contracts/agent-permissions.mjs";
import {agentRoles} from "../../../contracts/agent-roles.mjs";
import {Select} from "../../ui/Select";
import {ModelSettings} from "./ModelSettings";
import {effortLabel} from "../../../contracts/agent-settings.mjs";

type IconName="pick"|"image"|"image-off"|"role"|"model"|"provider"|"send"|"stop"|"close"|"refresh"|"brain"|"permission-read"|"permission-proposal"|"permission-full";
const permissionIcons:Record<AgentPermissionMode,IconName>={"read-only":"permission-read",proposal:"permission-proposal","full-access":"permission-full"};
function Icon({name}:{name:IconName}) {
  const paths:Record<IconName,ReactNode>={
    pick:<><path d="m5 3 14 9-7 1-3 7Z"/><path d="m12 13 4 6"/></>,
    image:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
    "image-off":<><path d="m3 3 18 18M9 3h8a4 4 0 0 1 4 4v8M3 9v8a4 4 0 0 0 4 4h8M3 17l5-5m8-2 5 7"/></>,
    role:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><path d="m18 3 1 1m-1 3h3"/></>,
    brain:<><path d="M12 5a4 4 0 0 0-7-1 4 4 0 0 0-2 7 4 4 0 0 0 2 7 4 4 0 0 0 7 2V5Zm0 0a4 4 0 0 1 7-1 4 4 0 0 1 2 7 4 4 0 0 1-2 7 4 4 0 0 1-7 2"/><path d="M7 7v3m10-3v3M7 15h2m6 0h2"/></>,
    "permission-read":<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    "permission-proposal":<><path d="m12 3 8 3v6c0 4.5-4 7.5-8 9-4-1.5-8-4.5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    "permission-full":<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V7a4 4 0 0 1 7.5-2M12 14v3"/></>,
    model:<><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><path d="M10 10h4v4h-4Z"/></>,
    provider:<><path d="M8 2v5m8-5v5M6 7h12v3a6 6 0 0 1-12 0Zm6 9v6"/></>,
    send:<><path d="M12 20V4m-6 6 6-6 6 6"/></>,
    stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    refresh:<><path d="M20 8a8 8 0 1 0 0 8"/><path d="M20 3v5h-5"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
export function AgentComposer({agent,enabled,blocked,selection,selectionStale,onPick,onClear,onLevel,onSubmit}:{agent:ReturnType<typeof useAgent>;enabled:boolean;blocked:boolean;selection:DomSelection|null;selectionStale:boolean;onPick:()=>void;onClear:()=>void;onLevel:(id:string)=>void;onSubmit:()=>void}) {
  const upload=useRef<HTMLInputElement>(null),[showConnection,setShowConnection]=useState(false);
  const locked=agent.submitting||agent.waiting||agent.readingReferences,ready=agent.job?.state==="ready",connection=agent.connection;
  const model=connection?.models.find(item=>item.id===agent.model),defaultModel=connection?.models.find(item=>item.id===connection.defaultModel);
  const activeModel=model||defaultModel,automaticEffort=activeModel?.efforts.includes(connection?.defaultEffort??"")?connection?.defaultEffort:activeModel?.defaultEffort;
  const modelLabel=agent.model?model?.name||agent.model:defaultModel?.name||connection?.defaultModel||"本机默认";
  const authLabels={authenticated:"已认证",required:"需要登录",external:"由 Provider 管理",unknown:"未确认"};
  const auth=connection?authLabels[connection.auth]:"尚未检查",last=connection?.lastRequest;
  const outcomes={running:"请求中",succeeded:"成功",failed:"失败",cancelled:"已取消"};
  const unavailable=!!agent.connectionError||connection?.available===false||connection?.auth==="required";
  const canSend=(!ready||agent.proposalMatches)&&agent.sessionReady&&!agent.savingSettings&&!blocked&&!locked&&!!agent.identity&&!!agent.prompt.trim()&&!!connection?.available&&connection.auth!=="required"&&!agent.checkingConnection&&!agent.connectionError;
  return <div className="agent-compose-area">
    {showConnection&&enabled&&<section className="codex-connection" aria-label="Codex 连接详情">
      <header><strong>Codex Provider</strong><button type="button" className="composer-icon" aria-label="关闭连接详情" title="关闭连接详情" onClick={()=>setShowConnection(false)}><Icon name="close"/></button></header>
      <dl><div><dt>当前来源</dt><dd>{connection?.provider.name||"本机 Codex"}</dd></div><div><dt>认证状态</dt><dd>{auth}{connection?.authMode==="chatgpt"?" · ChatGPT":connection?.authMode==="apiKey"?" · API Key":""}</dd></div><div><dt>本机默认模型</dt><dd>{defaultModel?.name||connection?.defaultModel||"尚未取得"}</dd></div><div><dt>最近请求</dt><dd>{last?<>{outcomes[last.state]} · {last.name}<time dateTime={new Date(last.at).toISOString()}>{new Date(last.at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</time></>:"尚未发送"}</dd></div></dl>
      {(agent.connectionError||connection?.error)&&<p role="status">{agent.connectionError||connection?.error}</p>}{connection?.auth==="required"&&<p>在本机 Codex 完成登录后刷新。</p>}
      {connection?.available&&!connection.catalogAvailable&&<p>模型目录暂不可用，仍可跟随本机已配置的默认模型。</p>}
      <footer><small>{connection?.checkedAt?"检查于 "+new Date(connection.checkedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"复用本机配置与登录"}</small><button type="button" className="composer-icon" aria-label="刷新 Codex 状态" title="刷新 Codex 状态" disabled={agent.checkingConnection} onClick={()=>void agent.refreshConnection(true)}><Icon name="refresh"/></button></footer>
    </section>}
    {selection&&<div className="element-selection composer-selection"><div className="element-chip"><Icon name="pick"/><strong title={selection.tag+" · "+selection.label}>{selection.tag} · {selection.label}</strong><button type="button" className="composer-icon" aria-label="移除元素上下文" title="移除元素上下文" onClick={onClear} disabled={locked}><Icon name="close"/></button></div><div className="composer-level"><Select label="选择元素层级" value={selection.domId} disabled={locked||selectionStale} onValueChange={onLevel} options={selection.ancestors.map(a=>({value:a.domId,label:a.label}))}/></div>{selection.instance&&<small>当前重复项 {selection.instance}</small>}{selectionStale&&<small>画面已更新，重新点选可更新元素层级。</small>}</div>}
    {!!agent.references.length&&<div className="design-references">{agent.references.map(reference=><div className="design-reference" key={reference.id}><img src={reference.data} alt={reference.name}/><span>{reference.name}</span><button type="button" className="composer-icon" aria-label={"移除参考图 · "+reference.name} title="移除参考图" disabled={locked} onClick={()=>agent.removeReference(reference.id)}><Icon name="close"/></button></div>)}</div>}
    {enabled?<>
      <form className="agent-composer" onSubmit={event=>{event.preventDefault();if(canSend)onSubmit();}}>
        <label className="sr-only" htmlFor="agent-prompt">发给 Agent</label><textarea id="agent-prompt" rows={3} value={agent.prompt} disabled={locked} onChange={e=>agent.setPrompt(e.target.value)} placeholder="讨论设计，或描述想调整的地方…"/>
        <div className="composer-toolbar" role="group" aria-label="Agent 输入工具">
          <div className="composer-tools">
            <button type="button" className="composer-icon" aria-label="点选元素" title="点选元素" onClick={onPick} disabled={locked}><Icon name="pick"/></button>
            <button type="button" className="composer-icon" aria-label="添加参考图" title="添加参考图" disabled={locked||agent.references.length>=3} onClick={()=>upload.current?.click()}><Icon name="image"/></button>
            <input className="sr-only" ref={upload} aria-label="参考图文件" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={locked||agent.references.length>=3} onChange={e=>{void agent.addReferences(e.target.files);e.target.value="";}}/>
            <Select label="设计身份" variant="toolbar" icon={<Icon name="role"/>} value={agent.identity??"interaction"} displayValue={agentRoles[agent.identity??"interaction"].label.replace("设计","")} disabled={locked||ready||agent.savingSettings||!agent.sessionReady} onValueChange={value=>agent.setIdentity(value as "interaction"|"visual")} options={Object.entries(agentRoles).map(([value,profile])=>({value,label:profile.label,icon:<Icon name="role"/>,description:value==="interaction"?"任务流程、页面状态与交互反馈":"布局、配色、组件细节与视觉表现"}))}/>
            <ModelSettings agent={agent} modelLabel={modelLabel} disabled={locked||!agent.sessionReady} modelDisabled={agent.checkingConnection||!connection?.available} effortDisabled={agent.checkingConnection||!activeModel?.efforts.length} icon={<Icon name="model"/>} fullAccessIcon={<Icon name="permission-full"/>}
              modelOptions={[{value:"",label:"跟随本机配置",description:defaultModel?.name||connection?.defaultModel||"使用本机默认模型"},...(agent.model&&!model?[{value:agent.model,label:agent.model,description:"已不在目录中，请刷新后重新选择",disabled:true}]:[]),...(connection?.models??[]).map(item=>({value:item.id,label:item.name,keywords:item.id,description:!item.images?"不支持图片，无法接收当前设计画面":item.isDefault?"本机默认模型，支持图片，可接收当前画面和参考图":"支持图片，可接收当前画面和参考图",descriptionIcon:<Icon name={item.images?"image":"image-off"}/>,disabled:!item.images}))]}
              effortOptions={[{value:"",label:"自动",description:automaticEffort?"当前默认："+effortLabel(automaticEffort):"跟随本机与模型默认设置"},...(activeModel?.efforts??[]).map(value=>({value,label:effortLabel(value)}))]}
              permissionOptions={permissionModes.map(mode=>({...mode,icon:<Icon name={permissionIcons[mode.value]}/>}))}/>
            <button type="button" className="composer-icon provider-trigger" aria-label="Codex Provider 状态" title={agent.checkingConnection?"正在读取 Codex 状态":"Codex · "+auth} aria-expanded={showConnection} data-state={unavailable?"error":agent.checkingConnection?"checking":connection?.auth==="authenticated"?"authenticated":"unknown"} onClick={()=>{setShowConnection(!showConnection);if(!showConnection)void agent.refreshConnection();}}><Icon name="provider"/><span className="provider-dot" aria-hidden="true"/></button>
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
