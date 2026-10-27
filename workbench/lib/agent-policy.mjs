import path from "node:path";
import {isDeepStrictEqual} from "node:util";
import {assert,readJson} from "./protocol.mjs";

export const candidateText=/\.(?:json|tsx?|jsx?|css|svg)$/i;
export const designText=/\.(?:json|tsx?|jsx?|css|svg|md)$/i;
const sharedFiles=new Set(["requirement.md","handoff.md","scenarios.json","manifest.json"]);
export const sharedDesignFile=file=>sharedFiles.has(file)||/^interactions\/.+\.md$/.test(file);

export function allowAgentFile(file,job) {
  if(file.startsWith("candidates/"+job.candidate+"/"))return candidateText.test(file);
  if(file==="handoff.md")return true;
  if(job.role!=="interaction")return false;
  return sharedDesignFile(file)||/^candidates\/[a-z][a-z0-9-]*\/pages\/.+\.json$/.test(file);
}

export function checkAgentScope(job) {
  const staged=path.join(job.directory,"requirements",job.requirement),before=JSON.parse(job.originalFiles.get("manifest.json")),after=readJson(path.join(staged,"manifest.json"));
  assert(after.pages?.some(page=>page.id===job.page),"提案不能移除当前评审页面");
  const stable=manifest=>{const copy=structuredClone(manifest);for(const key of ["title","pages","navigation","controls","viewports"])delete copy[key];copy.candidates=copy.candidates.map(candidate=>{delete candidate.pages;return candidate;});return copy;};
  assert(isDeepStrictEqual(stable(before),stable(after)),"交互提案只能调整页面登记、导航、场景及说明，不能更换候选或运行协议");
  const oldPages=new Set(before.pages.map(page=>page.id)),newPages=new Set(after.pages.map(page=>page.id)),permitted=new Set();
  for(const candidate of after.candidates)if(candidate.id!==job.candidate){
    const original=before.candidates.find(item=>item.id===candidate.id);
    for(const page of oldPages)if(newPages.has(page))assert(candidate.pages[page]===original.pages[page],"不能替换其他候选已有页面的来源");
    for(const page of newPages)if(!oldPages.has(page))permitted.add(candidate.pages[page]);
  }
  for(const change of job.changes){
    assert(allowAgentFile(change.path,job),"Agent 修改越过当前身份的设计范围："+change.path);
    if(change.path.startsWith("candidates/")&&!change.path.startsWith("candidates/"+job.candidate+"/")){
      assert(job.role==="interaction"&&permitted.has(change.path)&&!job.originalFiles.has(change.path),"不能修改其他候选的已有实现；只允许补齐新登记页面的 Spec");
    }
  }
  return {shared:job.changes.filter(change=>sharedDesignFile(change.path)).map(change=>change.path),candidates:job.changes.some(change=>sharedDesignFile(change.path))?after.candidates.map(candidate=>candidate.id):[job.candidate]};
}
