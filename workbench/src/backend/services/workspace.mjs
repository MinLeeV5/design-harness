import {assert} from "../../contracts/assertions.mjs";
import {SourceConflict} from "../../contracts/errors.mjs";
import {applyValues} from "../../contracts/resources.mjs";
import {designOrganization,requirementPurpose} from "../../contracts/design-organization.mjs";
import {canonicalDirectory,fileHash} from "../adapters/filesystem.mjs";
import {loadProject,loadRequirement,listRequirements} from "../adapters/resource-store.mjs";
import {writeSpec} from "../adapters/spec-store.mjs";

export {workspacePath,initialize,configureOrganization,createRequirement,cloneCandidate} from "../adapters/workspace-files.mjs";

export function openWorkspace(workspace) {
  const directory = canonicalDirectory(workspace);
  loadProject(directory);
  return directory;
}

export const requirementRevision = (workspace, id) => loadRequirement(workspace, id).revision;

export function firstRequirement(workspace) {
  const organization=designOrganization(loadProject(workspace)),items=listRequirements(workspace);
  if(organization?.mode==="continuous"&&items.some(item=>item.id===organization.primary)) {
    loadRequirement(workspace,organization.primary);
    return organization.primary;
  }
  return items.find(item => {
    try { const data=loadRequirement(workspace,item.id);return organization?.mode!=="continuous"||requirementPurpose(data.manifest)==="foundation-preview"; }
    catch { return false; }
  })?.id;
}

export function defaultDesign(workspace,id) {
  if(id)return id;
  const organization=designOrganization(loadProject(workspace));
  assert(organization?.mode==="continuous","请指定需求 ID；仅持续模式可默认使用产品主稿");
  return organization.primary;
}

export const projectOrganization=workspace=>designOrganization(loadProject(workspace));

export function saveValues(workspace, {id,candidate,page,expectedHash,values}) {
  const data = loadRequirement(workspace,id), key = candidate+":"+page;
  assert(data.specFiles[key], "页面或候选不存在");
  const file = data.specFiles[key];
  if (fileHash(file) !== expectedHash) {
    throw new SourceConflict("页面 Spec 已被其他编辑修改；未保存草稿已保留，请重新比较");
  }
  const spec = applyValues(data.manifest,page,data.specs[key],values);
  const hash = writeSpec(file,spec,expectedHash);
  return {hash,spec,beforeRevision:data.revision,revision:requirementRevision(workspace,id)};
}
