import path from "node:path";
import {isDeepStrictEqual} from "node:util";
import {assert} from "../../contracts/assertions.mjs";
import {readJson} from "../adapters/filesystem.mjs";

import {allowAgentFile,sharedDesignFile} from "../../contracts/agent-policy.mjs";
import {changesFor} from "../adapters/proposal-files.mjs";

export function checkAgentScope(job) {
  const staged=path.join(job.directory,"requirements",job.requirement),before=JSON.parse((job.turnOriginalFiles??job.originalFiles).get("manifest.json")),after=readJson(path.join(staged,"manifest.json"));
  assert(after.pages?.some(page=>page.id===job.page),"提案不能移除当前评审页面");
  const stable=manifest=>{const copy=structuredClone(manifest);for(const key of ["title","pages","navigation","controls","viewports"])delete copy[key];copy.candidates=copy.candidates.map(candidate=>{delete candidate.pages;return candidate;});return copy;};
  assert(isDeepStrictEqual(stable(before),stable(after)),"交互提案只能调整页面登记、导航、场景及说明，不能更换候选或运行协议");
  const oldPages=new Set(before.pages.map(page=>page.id)),newPages=new Set(after.pages.map(page=>page.id)),permitted=new Set();
  if(job.explorationPages)for(const page of before.pages)if(!job.explorationPages.includes(page.id)){
    assert(isDeepStrictEqual(after.pages.find(item=>item.id===page.id),page)&&after.candidates.every(candidate=>candidate.pages[page.id]===before.candidates.find(item=>item.id===candidate.id).pages[page.id]),"不能移除或改写任务范围外的页面："+page.id);
    const originalScenarios=JSON.parse((job.turnOriginalFiles??job.originalFiles).get("scenarios.json")),scenarios=readJson(path.join(staged,"scenarios.json"));
    assert(isDeepStrictEqual(scenarios.filter(item=>item.page===page.id),originalScenarios.filter(item=>item.page===page.id)),"不能修改任务范围外的页面场景："+page.id);
  }
  for(const candidate of after.candidates)if(candidate.id!==job.candidate){
    const original=before.candidates.find(item=>item.id===candidate.id);
    for(const page of oldPages)if(newPages.has(page))assert(candidate.pages[page]===original.pages[page],"不能替换其他候选已有页面的来源");
    for(const page of newPages)if(!oldPages.has(page))permitted.add(candidate.pages[page]);
  }
  const currentChanges=job.turnOriginalFiles?changesFor({...job,originalFiles:job.turnOriginalFiles}):job.changes;
  for(const change of currentChanges){
    assert(allowAgentFile(change.path,job),"Agent 修改越过当前身份的设计范围："+change.path);
    if(job.explorationPages){const candidate=before.candidates.find(item=>item.id===job.candidate);for(const page of before.pages)if(!job.explorationPages.includes(page.id))assert(change.path!==candidate.pages[page.id],"请在选定方向后扩展未探索页面："+page.id);}
    if(change.path.startsWith("candidates/")&&!change.path.startsWith("candidates/"+job.candidate+"/")){
      assert(job.role==="interaction"&&permitted.has(change.path)&&!job.originalFiles.has(change.path),"不能修改其他候选的已有实现；只允许补齐新登记页面的 Spec");
    }
  }
  // Inherited edits have already passed the originating identity's checks. Keep
  // the cumulative result inside that lineage's combined design permissions.
  const inheritedRole=job.inheritedRoles?.includes("interaction")||job.role==="interaction"?"interaction":"visual";
  for(const change of job.changes)assert(allowAgentFile(change.path,{...job,role:inheritedRole}),"继承方案越过已确认的设计范围："+change.path);
  return {shared:job.changes.filter(change=>sharedDesignFile(change.path)).map(change=>change.path),candidates:job.changes.some(change=>sharedDesignFile(change.path))?after.candidates.map(candidate=>candidate.id):[job.candidate]};
}
