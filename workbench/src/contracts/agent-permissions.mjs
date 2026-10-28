import {assert} from "./assertions.mjs";

export const permissionModes = [
  {value:"read-only",label:"只读分析",description:"允许读取和只读命令，通过提案返回修改"},
  {value:"proposal",label:"提案工作区",description:"在临时设计副本中执行命令和修改，接受后写回"},
  {value:"full-access",label:"完全访问",description:"可能在接受提案前修改源文件，放弃提案不会撤销这些修改"}
];
export const fullAccessWarning="完全访问：Agent 可执行命令、使用工具，并可能在你接受提案前修改源文件。放弃提案或取消任务不会自动撤销这些修改。";
export function validatePermissionMode(value="proposal"){
  assert(permissionModes.some(mode=>mode.value===value),"Agent 权限模式无效");return value;
}
export const permissionLabel=value=>permissionModes.find(mode=>mode.value===value)?.label??"提案工作区";
