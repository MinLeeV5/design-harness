import {assert,safeId} from "./assertions.mjs";

export function designOrganization(project) {
  const value=project.designOrganization;
  if(value===undefined||value===null)return null;
  assert(value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).every(key=>["mode","primary"].includes(key)),"designOrganization 只支持 mode 与 primary");
  assert(["continuous","per-requirement"].includes(value.mode),"设计组织模式需要 continuous 或 per-requirement");
  if(value.mode==="continuous")assert(safeId(value.primary),"持续模式需要合法的主稿 ID primary");
  else assert(value.primary===undefined,"按需求独立模式不设置主稿 primary");
  return value;
}

export function requirementPurpose(manifest) {
  const purpose=manifest.purpose??"design";
  assert(["design","foundation-preview"].includes(purpose),"设计用途需要 design 或 foundation-preview");
  return purpose;
}

export function creationPurpose(project,id,{separate=false,preview=false}={}) {
  assert(typeof separate==="boolean"&&typeof preview==="boolean"&&!(separate&&preview),"独立设计与基础验证预览不能同时指定");
  const organization=designOrganization(project);
  if(organization?.mode==="continuous") {
    if(id===organization.primary)assert(!preview&&!separate,"产品主稿不能作为基础预览或独立例外创建");
    else assert(preview||separate,"项目采用持续模式，请更新主稿 "+organization.primary+"；只有用户明确要求单独设计时才使用 --separate");
  }
  return preview?"foundation-preview":"design";
}
