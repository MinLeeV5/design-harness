import {useEffect,useState} from "react";
import {Popover} from "@base-ui/react/popover";
import type {useAgent} from "./use-agent";
import {Select} from "../../ui/Select";
import {AgentIcon} from "./AgentIcon";
import {AgentStatus,agentStatusLabel} from "./AgentStatus";

export function ApprovalIndicator({count}:{count:number}){
  return <span className="agent-approval-badge" role="status" aria-label={count+" 个会话等待审批"}><AgentStatus state="awaiting_approval" iconOnly decorative/><span>待审批</span></span>;
}
export function AgentSessionControls({agent}:{agent:ReturnType<typeof useAgent>}){
  const current=agent.sessions.find(session=>session.id===agent.sessionId);
  return <>
    <h2 id="inspector-title" aria-label="Agent"><Select className="agent-session-switch" label="Agent 会话" displayValue="Agent" title={current?"当前会话："+current.title:"切换 Agent 会话"} value={agent.sessionId} onValueChange={id=>void agent.selectSession(id)} options={agent.sessions.map((session,index)=>({value:session.id,label:(index+1)+" · "+session.title,description:agentStatusLabel(session.state),descriptionIcon:<AgentStatus state={session.state} iconOnly decorative/>}))}/></h2>
    <button type="button" className="composer-icon" aria-label="新建会话" title="新建会话" onClick={()=>void agent.newSession()} disabled={agent.creating||!agent.sessionReady}><AgentIcon name="plus"/></button>
  </>;
}
function MiddleText({value,tail=8}:{value:string;tail?:number}){
  const characters=Array.from(value),split=Math.max(0,characters.length-tail);
  return <span className="provider-middle-text" title={value}><span>{characters.slice(0,split).join("")}</span><span>{characters.slice(split).join("")}</span></span>;
}
function CopyableValue({value,copyLabel,session=false}:{value:string;copyLabel:string;session?:boolean}){
  const [status,setStatus]=useState<""|"copying"|"copied"|"failed">("");
  async function copy(){
    if(!value||status==="copying")return;setStatus("copying");
    try{await navigator.clipboard.writeText(value);setStatus("copied");}catch{setStatus("failed");}
  }
  const tail=session?8:Math.min(18,value.split(/[\\/]/).at(-1)?.length||12);
  return <dd className={"provider-copy-value"+(session?" codex-session-id":"")}>
    <code title={value}><MiddleText value={value} tail={tail}/></code>
    <button type="button" className="composer-icon" aria-label={copyLabel} title={copyLabel} disabled={!value||status==="copying"} onClick={()=>void copy()}><AgentIcon name="copy"/></button>
    <small role="status">{status==="copied"?"已复制":status==="failed"?(session?"复制失败，请选择 ID 手动复制。":"复制失败，请选择路径手动复制。"):status==="copying"?"正在复制…":""}</small>
  </dd>;
}
function SessionIdField({value}:{value:string}){
  return <div><dt>sessionId</dt><CopyableValue key={value} value={value} copyLabel="复制 sessionId" session/></div>;
}
export function ProviderStatus({agent}:{agent:ReturnType<typeof useAgent>}){
  const [open,setOpen]=useState(false),connection=agent.connection;
  useEffect(()=>setOpen(false),[agent.sessionId]);
  const authLabels={authenticated:"已认证",required:"需要登录",external:"由 Provider 管理",unknown:"未确认"};
  const auth=connection?authLabels[connection.auth]:"尚未检查",last=agent.job?.lastRequest??connection?.lastRequest;
  const model=connection?.models.find(item=>item.id===(agent.model||connection.defaultModel)),modelName=model?.name||agent.model||connection?.defaultModel||"尚未取得";
  const outcomes={running:"请求中",succeeded:"成功",failed:"失败",cancelled:"已取消"};
  const unavailable=!!agent.connectionError||connection?.available===false||connection?.auth==="required";
  const checked=connection?.checkedAt?new Date(connection.checkedAt).toLocaleTimeString("zh-CN"):"尚未检查";
  const providerName=connection?.provider.name||"本机 Codex",authMode=connection?.authMode==="chatgpt"?"ChatGPT":connection?.authMode==="apiKey"?"API Key":connection?.authMode;
  return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next)void agent.refreshConnection();}} modal={false}>
    <Popover.Trigger type="button" className="composer-icon provider-trigger" aria-label="Codex Provider 状态" title={agent.checkingConnection?"正在读取 Codex 状态":"Codex · "+auth} data-state={unavailable?"error":agent.checkingConnection?"checking":connection?.auth==="authenticated"?"authenticated":"unknown"}><AgentIcon name="provider"/><span className="provider-dot" aria-hidden="true"/></Popover.Trigger>
    <Popover.Portal><Popover.Positioner className="agent-provider-positioner" side="bottom" sideOffset={8} align="end" collisionPadding={10}>
      <Popover.Popup className="codex-connection" aria-label="Codex 连接详情" onKeyDownCapture={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);}}}>
        <header><strong>Codex Provider</strong><div className="provider-header-actions"><button type="button" className="composer-icon" aria-label="刷新 Codex 状态" title={"刷新 Codex 状态 · 上次检查 "+checked} disabled={agent.checkingConnection} onClick={()=>void agent.refreshConnection(true)}><AgentIcon name="refresh"/></button><Popover.Close type="button" className="composer-icon" aria-label="关闭连接详情" title="关闭连接详情"><AgentIcon name="close"/></Popover.Close></div></header>
        <div className="provider-content">
          <dl className="provider-connection-fields">
            <div><dt>来源</dt><dd className="provider-source"><span className="provider-clipped" title={providerName}>{providerName}</span><span className="provider-auth" data-auth={connection?.auth} title={auth+(authMode?" · "+authMode:"")}>{auth}</span></dd></div>
            <div><dt>当前模型</dt><dd className="provider-clipped" title={modelName}>{modelName}</dd></div>
            <div><dt>最近请求</dt><dd className="provider-request" title={last?outcomes[last.state]+" · "+last.name:"尚未发送"}><span className="provider-request-status" data-outcome={last?.state}>{last?outcomes[last.state]:"尚未发送"}</span>{last&&<time dateTime={new Date(last.at).toISOString()} title={new Date(last.at).toLocaleString("zh-CN")}>{new Date(last.at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</time>}</dd></div>
          </dl>
          <ProviderObservation key={agent.sessionId} agent={agent}/>
          {(agent.connectionError||connection?.error)&&<p className="provider-error" role="status">{agent.connectionError||connection?.error}</p>}{connection?.auth==="required"&&<p>在本机 Codex 完成登录后刷新。</p>}
          {connection?.available&&!connection.catalogAvailable&&<p>模型目录暂不可用，仍可跟随本机已配置的默认模型。</p>}
        </div>
        {agent.sessionId&&<dl className="provider-session"><SessionIdField key={agent.sessionId} value={agent.sessionId}/></dl>}
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}

function Metric({label,value,unit}:{label:string;value:number|undefined;unit:string}){
  const exact=value===undefined?"尚未取得":value.toLocaleString("zh-CN");
  const visible=value===undefined?"—":value>=1000000?new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(value):exact;
  return <div><dt>{label}</dt><dd title={value===undefined?exact:exact+" "+unit} aria-label={value===undefined?"尚未取得":exact+" "+unit}>{visible}{value!==undefined&&<> <small>{unit}</small></>}</dd></div>;
}
function ProviderObservation({agent}:{agent:ReturnType<typeof useAgent>}){
  const value=agent.observation,context=value?.context,usage=value?.usage;
  const number=(n:number|undefined)=>n===undefined?"尚未取得":n.toLocaleString("zh-CN");
  const roots=context?.roots,paths=roots?[["宿主项目",roots.hostProject],["正式资源",roots.sourceResources],["请求时副本",roots.proposal],["插件",roots.plugin]]:[];
  return <section className="provider-observation" aria-label="当前会话用量">
    <dl className="provider-metrics">
      <Metric label="最近输入" value={usage?.last?.inputTokens} unit="Token"/><Metric label="最近输出" value={usage?.last?.outputTokens} unit="Token"/>
      <Metric label="本轮文本" value={context?.characters} unit="字符"/><Metric label="会话累计" value={usage?.total?.totalTokens} unit="Token"/>
    </dl>
    <details className="provider-more">
      <summary>更多信息</summary>
      <dl>
        <div><dt>缓存输入</dt><dd>{number(usage?.last?.cachedInputTokens)}</dd></div>
        <div><dt>上下文窗口</dt><dd>{number(usage?.modelContextWindow)}</dd></div>
        <div><dt>压缩次数</dt><dd>{value?`${value.compactions} 次`:"尚未取得"}</dd></div>
      </dl>
      {roots&&<dl className="provider-paths">{paths.map(([label,path])=><div key={label}><dt>{label}</dt><CopyableValue key={path} value={path} copyLabel={"复制"+label+"路径"}/></div>)}</dl>}
      <p className="provider-explanation">Token 为原生返回值；最近调用与会话累计分别统计。本轮文本不含原生历史、工具结果和图片。</p>
    </details>
  </section>;
}
