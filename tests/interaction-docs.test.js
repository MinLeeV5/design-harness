import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {parseInteractionDocument} from "../workbench/lib/interaction-docs.mjs";
import {matchesWhen,pointerValue} from "../workbench/conditions.mjs";
import {initialize} from "../workbench/lib/workspace.mjs";
import {loadRequirement} from "../workbench/lib/protocol.mjs";
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
