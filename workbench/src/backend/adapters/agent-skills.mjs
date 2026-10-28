import fs from "node:fs";
import {PLUGIN} from "../paths.mjs";
import {assert} from "../../contracts/assertions.mjs";
import {resolveFile} from "./filesystem.mjs";
import {agentRoles} from "../../contracts/agent-roles.mjs";
import {designOrganization,requirementPurpose} from "../../contracts/design-organization.mjs";

export function loadAgentSkill(role) {
  assert(Object.hasOwn(agentRoles,role),"请明确选择交互设计或视觉设计身份");
  const profile=agentRoles[role],entry=resolveFile(PLUGIN,`workbench/agents/${role}.md`),instructions=fs.readFileSync(entry,"utf8");
  assert(instructions.length<=3000,"内部身份入口过大，请将详细方法放入按需资料");
  const guides=[
    [`${role}-method`,"当前专业的设计方法","设计任务开始时"],
    ["fidelity","完整性、保真与验证依据","核对画面、交互或完成结论时"],
    ["protocol","Spec、组件、场景与资源协议","修改对应资源前，定位相关章节"],
    ["interactions","交互说明、导航与状态同步","修改说明、导航或状态时"],
    ["product-source","正式 PRD 与设计依据","涉及业务来源或需求变化时"],
    ["design-organization","主稿与独立需求","解释设计归属时；项目配置由外部阶段维护"],
    ["proposal","修改结果与控件约束","返回修改或控件前"],
    ...(role==="visual"?[["assets","图形与素材方法","创建或替换素材时"]]:[])
  ];
  return {...profile,role,entry,instructions,resources:guides.map(([name,purpose,when])=>({path:resolveFile(PLUGIN,`shared/references/${name}.md`),purpose,when}))};
}
export function designContext(data) {
  const organization=designOrganization(data.project);
  return {mode:organization?.mode??"unconfirmed",primary:organization?.mode==="continuous"?organization.primary:null,current:data.manifest.id,purpose:requirementPurpose(data.manifest)};
}
