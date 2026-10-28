import {assert} from "./assertions.mjs";
import {validatePermissionMode} from "./agent-permissions.mjs";
export const defaultAgentSettings=()=>({identity:"interaction",model:"",efforts:{},permissionMode:"proposal"});
const record=value=>value&&typeof value==="object"&&!Array.isArray(value);
const modelId=value=>typeof value==="string"&&value.length<=160&&!/[\x00-\x1f]/.test(value)&&!["__proto__","constructor","prototype"].includes(value);
const effortValue=value=>typeof value==="string"&&(value===""||/^[a-z][a-z0-9_-]{0,31}$/.test(value));
export function validateAgentSettings(value){
  assert(record(value)&&["interaction","visual"].includes(value.identity)&&modelId(value.model)&&record(value.efforts),"设计偏好格式无效");
  assert(Object.keys(value.efforts).length<=128,"记忆的模型过多");
  for(const [model,effort]of Object.entries(value.efforts))assert(model&&modelId(model)&&effortValue(effort),"思考深度偏好无效");
  return {identity:value.identity,model:value.model,efforts:{...value.efforts},permissionMode:validatePermissionMode(value.permissionMode)};
}
export function mergeAgentSettings(before,patch){
  assert(record(patch)&&Object.keys(patch).length>0&&Object.keys(patch).every(key=>["identity","model","effort","permissionMode"].includes(key)),"设计偏好更新无效");
  const next=validateAgentSettings(before);
  if(Object.hasOwn(patch,"identity"))next.identity=patch.identity;
  if(Object.hasOwn(patch,"model"))next.model=patch.model;
  if(Object.hasOwn(patch,"permissionMode"))next.permissionMode=validatePermissionMode(patch.permissionMode);
  if(Object.hasOwn(patch,"effort")){const item=patch.effort;assert(record(item)&&Object.keys(item).length===2&&item.model&&modelId(item.model)&&effortValue(item.value),"思考深度偏好无效");const entries=Object.entries(next.efforts).filter(([model])=>model!==item.model);entries.push([item.model,item.value]);next.efforts=Object.fromEntries(entries.slice(-128));}
  return validateAgentSettings(next);
}
export function effortLabel(value){return ({none:"关闭",minimal:"最低",low:"低",medium:"中",high:"高",xhigh:"很高",max:"极高",ultra:"最高"})[value]||value||"自动";}
