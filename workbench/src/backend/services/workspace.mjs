import {assert} from "../../contracts/assertions.mjs";
import {SourceConflict} from "../../contracts/errors.mjs";
import {applyValues} from "../../contracts/resources.mjs";
import {canonicalDirectory,fileHash} from "../adapters/filesystem.mjs";
import {loadProject,loadRequirement,listRequirements} from "../adapters/resource-store.mjs";
import {writeSpec} from "../adapters/spec-store.mjs";

export {workspacePath,initialize,createRequirement,cloneCandidate} from "../adapters/workspace-files.mjs";

export function openWorkspace(workspace) {
  const directory = canonicalDirectory(workspace);
  loadProject(directory);
  return directory;
}

export const requirementRevision = (workspace, id) => loadRequirement(workspace, id).revision;

export function firstRequirement(workspace) {
  return listRequirements(workspace).find(item => {
    try { loadRequirement(workspace, item.id); return true; }
    catch { return false; }
  })?.id;
}

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
