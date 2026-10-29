import {AgentIcon,type IconName} from "./AgentIcon";

type Status={label:string;icon:IconName;tone:"active"|"success"|"attention"|"neutral"|"danger";busy?:boolean};
const statuses:Record<string,Status>={
  idle:{label:"尚未发送",icon:"status-idle",tone:"neutral"},
  running:{label:"正在处理",icon:"refresh",tone:"active",busy:true},
  awaiting_approval:{label:"等待你审批",icon:"approval",tone:"attention"},
  validating:{label:"正在校验",icon:"refresh",tone:"active",busy:true},
  accepting:{label:"正在接受修改",icon:"refresh",tone:"active",busy:true},
  ready:{label:"预览待确认",icon:"permission-read",tone:"active"},
  accepted:{label:"已接受",icon:"status-success",tone:"success"},
  discarded:{label:"已放弃",icon:"status-cancelled",tone:"neutral"},
  superseded:{label:"已继续调整",icon:"refresh",tone:"neutral"},
  cancelled:{label:"已取消",icon:"status-cancelled",tone:"neutral"},
  failed:{label:"处理失败",icon:"status-failed",tone:"danger"},
  answered:{label:"已回复",icon:"status-reply",tone:"neutral"},
  done:{label:"已完成",icon:"status-success",tone:"success"},
  declined:{label:"已拒绝",icon:"status-cancelled",tone:"neutral"},
  ended:{label:"已结束",icon:"status-idle",tone:"neutral"}
};
function statusFor(state:string){return statuses[state]??{label:state||statuses.idle.label,icon:"status-idle" as const,tone:"neutral" as const};}
export function agentStatusLabel(state:string){return statusFor(state).label;}
export function AgentStatus({state,label,iconOnly=false,decorative=false,className=""}:{state:string;label?:string;iconOnly?:boolean;decorative?:boolean;className?:string}){
  const status=statusFor(state),text=label??status.label;
  return <span className={"agent-status"+(iconOnly?" agent-status-icon":"")+(className?" "+className:"")} data-state={state} data-tone={status.tone} title={decorative?undefined:text} role={iconOnly&&!decorative?"img":undefined} aria-label={iconOnly&&!decorative?text:undefined} aria-hidden={decorative||undefined}>
    {status.busy?<span className="loading-spinner" aria-hidden="true"/>:<AgentIcon name={status.icon}/>}{!iconOnly&&<span>{text}</span>}
  </span>;
}
