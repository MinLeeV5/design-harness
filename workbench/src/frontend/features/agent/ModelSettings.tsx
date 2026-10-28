import {useEffect,useRef,useState,type ReactNode} from "react";
import {Popover} from "@base-ui/react/popover";
import {Tabs} from "@base-ui/react/tabs";
import {Select,type SelectOption} from "../../ui/Select";
import type {AgentPermissionMode} from "../../../contracts/types";
import {permissionLabel,fullAccessWarning} from "../../../contracts/agent-permissions.mjs";
import {effortLabel} from "../../../contracts/agent-settings.mjs";
import type {useAgent} from "./use-agent";

type Props={agent:ReturnType<typeof useAgent>;modelLabel:string;modelOptions:SelectOption[];effortOptions:SelectOption[];permissionOptions:SelectOption[];disabled:boolean;modelDisabled:boolean;effortDisabled:boolean;icon:ReactNode;fullAccessIcon:ReactNode};
export function ModelSettings({agent,modelLabel,modelOptions,effortOptions,permissionOptions,disabled,modelDisabled,effortDisabled,icon,fullAccessIcon}:Props){
  const [open,setOpen]=useState(false),[tab,setTab]=useState("model"),popup=useRef<HTMLDivElement>(null);
  useEffect(()=>setOpen(false),[agent.sessionId]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  const summary="模型 · "+modelLabel+"；推理强度 · "+effortLabel(agent.effort)+"；权限 · "+permissionLabel(agent.permissionMode);
  return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next)setTab("model");}} modal={false}>
    <Popover.Trigger type="button" aria-label="模型" title={summary} aria-description={summary} aria-busy={agent.savingSettings||agent.checkingConnection} disabled={disabled} className="wb-select-trigger wb-select-toolbar composer-model" data-workbench-select="" data-agent-model-settings="" data-value={agent.model} data-effort={agent.effort} data-permission-mode={agent.permissionMode}>
      <span className="wb-select-trigger-icon" aria-hidden="true">{icon}</span><span className="wb-select-value">{modelLabel}</span>
      {agent.permissionMode==="full-access"&&<span className="model-full-access" aria-label="完全访问" title="完全访问">{fullAccessIcon}</span>}
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner className="agent-model-positioner" side="top" sideOffset={8} align="end" collisionPadding={10}>
      <Popover.Popup ref={popup} className="agent-model-popup" aria-label="模型与设置" data-workbench-select-popup="" initialFocus={openType=>openType==="touch"?true:popup.current?.querySelector<HTMLInputElement>('[aria-label="搜索模型"]')??true} onKeyDownCapture={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setOpen(false);}}}>
        <header className="agent-model-heading"><Popover.Title>模型与设置</Popover.Title><Popover.Close type="button" aria-label="关闭模型设置" title="关闭模型设置">×</Popover.Close></header>
        <Tabs.Root className="agent-model-tabs" value={tab} onValueChange={value=>setTab(String(value))}>
          <Tabs.List className="agent-model-tab-list" aria-label="模型设置分类" activateOnFocus>
            <Tabs.Tab value="model">模型</Tabs.Tab><Tabs.Tab value="effort">推理强度</Tabs.Tab><Tabs.Tab value="permission">权限</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel className="agent-model-tab-panel" value="model"><Select inline label="模型" value={agent.model} options={modelOptions} searchable onValueChange={agent.setModel} disabled={modelDisabled||agent.savingSettings}/></Tabs.Panel>
          <Tabs.Panel className="agent-model-tab-panel" value="effort"><p className="agent-model-description">{modelLabel} 支持的推理强度</p><Select inline label="推理强度" value={agent.effort} options={effortOptions} searchable={false} onValueChange={agent.setEffort} disabled={effortDisabled||agent.savingSettings}/>{effortDisabled&&<p className="agent-model-description">当前模型暂未提供可选的推理强度。</p>}</Tabs.Panel>
          <Tabs.Panel className="agent-model-tab-panel" value="permission"><Select inline label="权限" value={agent.permissionMode} options={permissionOptions} searchable={false} onValueChange={value=>agent.setPermissionMode(value as AgentPermissionMode)} disabled={agent.savingSettings}/>{agent.permissionMode==="full-access"&&<p className="agent-permission-warning">{fullAccessWarning}</p>}</Tabs.Panel>
        </Tabs.Root>
        <p className="agent-model-save-state" role="status">{agent.savingSettings?"正在保存选择…":agent.settingsError||"选择立即生效，可继续切换设置"}</p>
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
