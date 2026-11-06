import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {parseInteractionDocument} from "../workbench/src/backend/adapters/interaction-docs.mjs";
import {matchesWhen,pointerValue} from "../workbench/src/contracts/conditions.mjs";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
const example=`---
schemaVersion: 1
page: tasks
annotations:
  - id: submit
    target: form/submit
    view: steps
    placement: right
    when:
      /phase: [new, retry]
sources:
  - kind: prd
    ref: requirement.md
---

## 开始任务 {#submit}

提交后保留当前输入。

### 校验
输入必须完整。

### 执行
点击后才开始。
`;
const parse=source=>parseInteractionDocument(source,{file:"interactions/tasks.md",pages:new Set(["tasks"])});
const dimensionDocument=body=>`---
schemaVersion: 1
page: tasks
annotations:
  - id: submit
    target: form/submit
    view: dimensions
---

## 提交任务 {#submit}

${body}
`;
test("A dimension note can contain just one relevant dimension without a summary or empty sections",()=>{
  const [item]=parse(dimensionDocument("### 异常\n失败保留输入，可重试。"));
  assert.equal(item.view,"dimensions");assert.equal(item.intro,"");assert.equal(item.blocks.length,1);assert.equal(item.blocks[0].dimension,"recovery");assert.match(item.blocks[0].html,/失败保留输入/);
});
test("Dimension notes combine typed blocks in authored order and preserve state lists and ordered steps",()=>{
  const [item]=parse(dimensionDocument("### 条件\n主题完整时可提交。\n\n### 操作\n点击提交后创建任务。\n\n### 状态\n- 处理中：禁止重复提交。\n- 完成：显示结果。\n\n### 异常\n失败保留输入，可重试。\n\n### 流程\n1. 填写主题。\n2. 提交任务。\n3. 查看结果。"));
  assert.deepEqual(item.blocks.map(block=>block.dimension),["condition","operation","state","recovery","flow"]);assert.equal(item.intro,"");assert.match(item.blocks[2].html,/<ul>/);assert.match(item.blocks[4].html,/<ol>/);
  const [context]=parse(dimensionDocument("必要的独立背景。\n\n### 条件\n仅管理员可操作。"));assert.match(context.intro,/必要的独立背景/);
});
test("Dimension notes reject unknown, duplicate, empty and absent dimensions with actionable errors",()=>{
  for(const [body,error] of [["### 恢复方式\n可重试。",/维度应为操作、条件、状态、异常或流程/],["### 异常\n可重试。\n\n### 异常\n保留输入。",/维度重复/],["### 条件\n\n### 操作\n提交任务。",/维度内容不能为空/],["### 异常\n\n",/维度内容不能为空/],["只有一段正文。",/至少需要一个维度/]])assert.throws(()=>parse(dimensionDocument(body)),error);
});
test("Dimension notes reject content that renders empty, including reference definitions and images without alt text",()=>{
  for(const content of ["[ref]: https://example.com","![](example.png)","&nbsp;","---"])assert.throws(()=>parse(dimensionDocument("### 条件\n"+content)),/维度内容不能为空/);
  assert.match(parse(dimensionDocument("### 操作\n![参考图说明](example.png)"))[0].blocks[0].html,/参考图说明/);
});
test("Existing views retain their custom sections and omitted view still defaults to card",()=>{
  for(const view of ["card","steps","rules","states"]){const [item]=parse(example.replace("view: steps","view: "+view));assert.equal(item.view,view);assert.deepEqual(item.blocks.map(block=>block.title),["校验","执行"]);assert.ok(item.blocks.every(block=>!Object.hasOwn(block,"dimension")));}
  assert.equal(parse(example.replace("    view: steps\n",""))[0].view,"card");
});
test("Dimension content uses the same safe Markdown rendering and fenced headings remain content",()=>{
  const [item]=parse(dimensionDocument('### 异常\n失败保留输入。\n\n```markdown\n### 未知维度\n```\n<script>alert(1)</script>\n[链接](javascript:alert(1))'));
  assert.equal(item.blocks.length,1);assert.match(item.blocks[0].html,/未知维度/);assert.doesNotMatch(item.blocks[0].html,/<script>|href="javascript:/);
});
test("The shared authoring example is a valid compact note without a required introduction",()=>{
  const guide=fs.readFileSync(new URL("../shared/references/interactions.md",import.meta.url),"utf8"),source=guide.match(/```markdown\n([\s\S]*?)\n```/)[1]+"\n";
  const [item]=parseInteractionDocument(source,{file:"interactions/catalog.md",pages:new Set(["catalog"])});
  assert.equal(item.view,"dimensions");assert.equal(item.intro,"");assert.deepEqual(item.blocks.map(block=>block.dimension),["condition","operation","recovery"]);
});
test("New workspace notes demonstrate short optional dimensions while retaining source and annotation targets",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-dimension-template-"));try{
    const workspace=initialize(base,{example:true}).workspace,data=loadRequirement(workspace,"example");
    assert.equal(data.interactions.length,5);assert.ok(data.interactions.every(item=>item.view==="dimensions"&&item.intro===""&&item.blocks.length>=1&&item.blocks.length<=3&&item.sources.length>0));
    assert.deepEqual(new Set(data.interactions.flatMap(item=>item.blocks.map(block=>block.dimension))),new Set(["condition","operation","state","recovery","flow"]));
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("Independent Markdown provides source, state conditions and readable blocks without component documentation",()=>{
  const [item]=parse(example);assert.equal(item.id,"submit");assert.equal(item.page,"tasks");assert.equal(item.view,"steps");assert.equal(item.placement,"right");assert.equal(item.label,"开始任务");assert.deepEqual(item.blocks.map(b=>b.title),["校验","执行"]);assert.equal(item.sources[0].ref,"requirement.md");assert.match(item.html,/输入必须完整/);assert.match(item.intro,/提交后保留/);
});
test("Protocol rejects ambiguous metadata, missing content, executable conditions and unknown rendering modes",()=>{
  for(const source of [example.replace("schemaVersion: 1","schemaVersion: 1\nschemaVersion: 1"),example.replace("page: tasks","page: missing"),example.replace("view: steps","view: arbitrary-react"),example.replace("/phase: [new, retry]","phase: new"),example.replace("/phase: [new, retry]","/phase: {eval: true}"),example.replace("{#submit}","{#other}"),example.replace("placement: right","placement: right\n    script: execute"),example.replace("page: tasks","page: &p tasks\nsources: *p")])assert.throws(()=>parse(source));
});
test("Fenced headings stay content and unsafe HTML and links are escaped",()=>{
  const [item]=parse(example+'\n```markdown\n## 假标题 {#fake}\n```\n<script>alert(1)</script>\n[链接](javascript:alert(1))\n');assert.match(item.html,/假标题/);assert.doesNotMatch(item.html,/<script>|href="javascript:/);
});
test("Conditions match live values including false, null and escaped JSON Pointer segments",()=>{
  const state={phase:"new",disabled:false,nested:{"a/b":{"~value":null}}};assert.equal(matchesWhen({"/phase":["new","retry"],"/disabled":false},state),true);assert.equal(matchesWhen({"/phase":"complete"},state),false);assert.equal(matchesWhen({"/missing":null},state),false);assert.equal(pointerValue(state,"/nested/a~1b/~0value"),null);assert.equal(matchesWhen({"/nested/a~1b/~0value":null},state),true);
});
test("Loading resolves docs once, invalidates revision on edits and rejects duplicate IDs or missing Spec targets",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-interaction-test-"));try{
    const workspace=initialize(base,{example:true}).workspace,folder=path.join(workspace,"requirements/example"),file=path.join(folder,"interactions/task.md"),source=fs.readFileSync(file,"utf8"),before=loadRequirement(workspace,"example");
    assert.equal(before.interactions.length,5);assert.equal(before.scenarios.some(s=>Object.hasOwn(s,"annotations")),false);fs.appendFileSync(file,"\n新增说明。\n");assert.notEqual(loadRequirement(workspace,"example").revision,before.revision);
    fs.writeFileSync(path.join(folder,"interactions/duplicate.md"),source);assert.throws(()=>loadRequirement(workspace,"example"),/ID 必须/);fs.unlinkSync(path.join(folder,"interactions/duplicate.md"));
    fs.writeFileSync(file,source.replace("target: task-form\n","target: missing\n"));assert.throws(()=>loadRequirement(workspace,"example"),/目标不在页面/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
