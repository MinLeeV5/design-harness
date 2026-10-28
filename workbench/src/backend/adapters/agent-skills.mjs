import fs from "node:fs";
import path from "node:path";
import {PLUGIN} from "../paths.mjs";
import {assert} from "../../contracts/assertions.mjs";
import {resolveFile,filesIn} from "./filesystem.mjs";
import {agentRoles} from "../../contracts/agent-roles.mjs";

export function loadAgentSkill(role) {
  assert(Object.hasOwn(agentRoles,role),"请明确选择交互设计或视觉设计身份");
  const profile=agentRoles[role],base="skills/"+profile.skill;
  const names=[base+"/SKILL.md",base+"/references/workflow.md",base+"/references/evaluation.md",
    ...["agent","fidelity","protocol","interactions","product-source",...(role==="visual"?["assets"]:[])].map(name=>"shared/references/"+name+".md")];
  const documents=names.map(name=>({file:name,content:fs.readFileSync(resolveFile(PLUGIN,name),"utf8")}));
  return {...profile,role,documents};
}

export function designContext(data,role) {
  const documents=filesIn(data.folder).filter(file=>/\.md$/i.test(file)&&["requirement.md","handoff.md","interactions"].includes(path.relative(data.folder,file).split(path.sep)[0]))
    .map(file=>({file:path.relative(data.folder,file).split(path.sep).join("/"),content:fs.readFileSync(file,"utf8")}));
  const foundationNotes=filesIn(data.foundationRoot).filter(file=>/\.md$/i.test(file)).map(file=>({file:"foundation/"+path.relative(data.foundationRoot,file),content:fs.readFileSync(file,"utf8")}));
  assert(JSON.stringify({documents,foundationNotes}).length<=700000,"需求说明过大，请缩小设计范围后再使用 Agent");
  return {documents,foundationNotes,scenarios:data.scenarios,role};
}
