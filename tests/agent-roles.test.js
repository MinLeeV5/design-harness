import {testConnection} from "./helpers/codex-connection.mjs";
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {inflateSync} from "node:zlib";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {captureDesignView,saveDesignReferences} from "../workbench/src/backend/adapters/design-capture.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {readJson} from "../workbench/src/backend/adapters/filesystem.mjs";

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nq8AAAAASUVORK5CYII=","base64");
const capture={page:"task",width:1440,height:960,state:{phase:"new",topic:"用户实际输入"},html:'<!doctype html><html><body><input value="用户实际输入"></body></html>'};
const request=(workspace,role="interaction")=>({type:"message",role,id:"example",candidate:"comfortable",page:"task",scenario:"new",capture,expectedRevision:loadRequirement(workspace,"example").revision,prompt:"完善当前设计"});
async function settled(runtime,id){const deadline=Date.now()+45000;while(Date.now()<deadline){const job=runtime.get(id);if(!["running","validating"].includes(job.state))return job;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("专业提案未完成");}
async function fixture(run,check){const temp=fs.mkdtempSync(path.join(os.tmpdir(),"dh-roles-")),workspace=initialize(temp,{example:true}).workspace,runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),run,capture:async({directory})=>{const file=path.join(directory,"current-view.png");fs.writeFileSync(file,png);return file;}});try{await check({workspace,runtime});}finally{await runtime.close();fs.rmSync(temp,{recursive:true,force:true});}}
const changedFile=(directory,relative,transform)=>({path:relative,content:transform(fs.readFileSync(path.join(directory,"requirements/example",relative),"utf8"))});

test("Internal identities share conversation and expose readable resources without preloading documents or state",async()=>{
  const calls=[];
  await fixture(async input=>{
    const map=JSON.parse(input.prompt.match(/^Resource map: (.+)$/m)[1]);
    const stateFile=map.entries.find(e=>e.path.endsWith("/state.json")).path;
    const screenshot=map.entries.find(e=>e.path.endsWith("/current-view.png")).path;
    assert.equal(fs.readFileSync(screenshot).subarray(0,8).equals(png.subarray(0,8)),true);
    calls.push({...input,map,screenshot,state:JSON.parse(fs.readFileSync(stateFile,"utf8"))});
    assert.equal(input.imageFiles.length,calls.length===1?1:0);
    return {summary:"先确认阅读目标，再落实设计。",files:[],controls:[]};
  },async({workspace,runtime})=>{
    await assert.rejects(runtime.event({...request(workspace),role:"unknown"}),/选择.*身份/);
    const first=await settled(runtime,(await runtime.event({...request(workspace,"visual"),prompt:"我希望更安静的会话样式",references:[{name:"阅读参考.png",data:"data:image/png;base64,"+png.toString("base64")}]})).id);
    assert.equal(first.state,"answered",first.error);assert.equal(first.skill,"workbench-visual");
    assert.equal(calls[0].state.topic,"用户实际输入");assert.doesNotMatch(calls[0].prompt,/用户实际输入|Trusted Skill documents|using \$design-harness/);
    assert.ok(calls[0].map.identity.entry.endsWith("workbench/agents/visual.md"));
    assert.ok(calls[0].map.entries.some(e=>e.path.endsWith("shared/references/visual-method.md")));
    assert.ok(calls[0].map.entries.some(e=>e.path.endsWith("shared/references/product-source.md")));
    assert.equal(fs.existsSync(calls[0].screenshot),false);
    const second=await settled(runtime,(await runtime.event({...request(workspace),prompt:"保留已确认阅读方向，补充失败恢复"})).id);
    assert.equal(second.state,"answered",second.error);assert.equal(second.messages.length,4);
    assert.deepEqual(second.messages.filter(m=>m.role==="assistant").map(m=>m.identity),["visual","interaction"]);
    assert.equal(calls[1].session,calls[0].session);assert.doesNotMatch(calls[1].prompt,/我希望更安静的会话样式/);
    assert.match(calls[1].prompt,/workbench-interaction/);assert.equal(runtime.session("example","compact").messages.length,0);
  });
});

test("An interaction proposal previews implementation, Markdown, scenarios and page labels together, then accepts them as one change",async()=>{
  await fixture(async({directory})=>({summary:"完善恢复说明和体验入口",files:[
    changedFile(directory,"interactions/task.md",text=>text.replace("## 失败与恢复","## 保留输入并恢复")),
    changedFile(directory,"scenarios.json",text=>{const list=JSON.parse(text);list.push({id:"retry",page:"task",title:"恢复前确认",state:{phase:"error",topic:"已保留主题"}});return JSON.stringify(list);}),
    changedFile(directory,"manifest.json",text=>{const manifest=JSON.parse(text);manifest.pages[0].title="会话与恢复";return JSON.stringify(manifest);}),
    changedFile(directory,"candidates/comfortable/pages/task.json",text=>{const spec=JSON.parse(text);spec.elements["task-page"].props.title="更清晰的整理流程";return JSON.stringify(spec);})
  ],controls:[]}),async({workspace,runtime})=>{
    const root=path.join(workspace,"requirements/example"),before=fs.readFileSync(path.join(root,"interactions/task.md")),other=fs.readFileSync(path.join(root,"candidates/compact/pages/task.json"));
    const job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"ready",job.error);assert.deepEqual(job.proposal.impact.candidates,["comfortable","compact"]);assert.equal(job.proposal.impact.shared.length,3);assert.match(job.proposal.interactions.find(item=>item.id==="recovery").label,/保留输入/);assert.match(job.proposal.reviewHtml,/恢复前确认/);assert.deepEqual(fs.readFileSync(path.join(root,"interactions/task.md")),before);
    await assert.rejects(runtime.event({...request(workspace,"visual"),baseJob:job.id}),/切换设计身份/);
    await runtime.event({type:"accept",job:job.id});assert.match(fs.readFileSync(path.join(root,"interactions/task.md"),"utf8"),/保留输入并恢复/);assert.equal(readJson(path.join(root,"scenarios.json")).at(-1).id,"retry");assert.equal(readJson(path.join(root,"manifest.json")).pages[0].title,"会话与恢复");assert.equal(readJson(path.join(root,"candidates/comfortable/pages/task.json")).elements["task-page"].props.title,"更清晰的整理流程");assert.deepEqual(fs.readFileSync(path.join(root,"candidates/compact/pages/task.json")),other);
  });
});

test("Shared annotation changes must render in every candidate, not only the edited one",async()=>{
  await fixture(async({directory})=>({summary:"增加恢复目标",files:[changedFile(directory,"interactions/task.md",text=>text.replace("target: task-form/submit","target: task-form/new-action")),changedFile(directory,"candidates/comfortable/components/Task.tsx",text=>text.replace('designPart("submit")','designPart("new-action")'))],controls:[]}),async({workspace,runtime})=>{
    const file=path.join(workspace,"requirements/example/interactions/task.md"),before=fs.readFileSync(file),job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"failed");assert.match(job.error,/丢失说明目标/);assert.deepEqual(fs.readFileSync(file),before);
  });
});

test("Interaction can register a complete new page while preserving all existing other-candidate implementation",async()=>{
  await fixture(async({directory})=>{
    const root=path.join(directory,"requirements/example"),manifest=readJson(path.join(root,"manifest.json")),files=[];manifest.pages.push({id:"notes",title:"阅读说明"});
    for(const candidate of manifest.candidates){const target="candidates/"+candidate.id+"/pages/notes.json";files.push({path:target,content:fs.readFileSync(path.join(root,candidate.pages.task),"utf8")});candidate.pages.notes=target;}
    const scenarios=readJson(path.join(root,"scenarios.json"));scenarios.push({id:"notes",page:"notes",title:"阅读说明",state:{phase:"new"}});
    files.push({path:"manifest.json",content:JSON.stringify(manifest)},{path:"scenarios.json",content:JSON.stringify(scenarios)});return {summary:"新增完整说明页",files,controls:[]};
  },async({workspace,runtime})=>{const before=fs.readFileSync(path.join(workspace,"requirements/example/candidates/compact/pages/task.json")),job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"ready",job.error);assert.match(job.proposal.reviewHtml,/阅读说明/);await runtime.event({type:"accept",job:job.id});const data=loadRequirement(workspace,"example");assert.ok(data.specs["compact:notes"]);assert.deepEqual(fs.readFileSync(path.join(data.folder,"candidates/compact/pages/task.json")),before);});
});

test("Identity scopes reject shared edits from Visual, foundation edits, existing sibling edits and runtime protocol replacement",async()=>{
  for(const [role,make]of [
    ["visual",directory=>changedFile(directory,"interactions/task.md",text=>text+"\n越界")],
    ["interaction",()=>({path:"../../foundation/tokens.css",content:"body{}"})],
    ["interaction",directory=>changedFile(directory,"candidates/compact/pages/task.json",text=>{const spec=JSON.parse(text);spec.elements["task-page"].props.title="越界页面";return JSON.stringify(spec);})],
    ["interaction",directory=>changedFile(directory,"manifest.json",text=>{const manifest=JSON.parse(text);manifest.candidates[0].registry="candidates/compact/registry.tsx";return JSON.stringify(manifest);})]
  ])await fixture(async({directory})=>({summary:"不可接受的修改",files:[make(directory)],controls:[]}),async({workspace,runtime})=>{const revision=loadRequirement(workspace,"example").revision,job=await settled(runtime,(await runtime.event(request(workspace,role))).id);assert.equal(job.state,"failed",job.error);assert.equal(loadRequirement(workspace,"example").revision,revision);});
});

test("Shared proposal conflicts preserve every original file and retain the preview",async()=>{
  await fixture(async({directory})=>({summary:"补充说明",files:[changedFile(directory,"interactions/task.md",text=>text.replace("## 失败与恢复","## 安全恢复")),changedFile(directory,"candidates/comfortable/pages/task.json",text=>text.replace("资料整理工作台","新工作台"))],controls:[]}),async({workspace,runtime})=>{const root=path.join(workspace,"requirements/example"),job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"ready",job.error);const spec=fs.readFileSync(path.join(root,"candidates/comfortable/pages/task.json"));fs.appendFileSync(path.join(root,"requirement.md"),"\n外部已确认的新边界");await assert.rejects(runtime.event({type:"accept",job:job.id}),/源资源已被修改/);assert.deepEqual(fs.readFileSync(path.join(root,"candidates/comfortable/pages/task.json")),spec);assert.doesNotMatch(fs.readFileSync(path.join(root,"interactions/task.md"),"utf8"),/安全恢复/);assert.equal(runtime.get(job.id).state,"ready");});
});

test("The static capture renderer creates a PNG with product scripts and network disabled; invalid references fail",async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"dh-capture-test-"));try{
    const file=await captureDesignView({capture:{...capture,html:'<!doctype html><html><head><style>body{background:rgb(120,20,200);color:white}</style></head><body><h1>已输入的实际画面</h1><script>document.body.innerHTML="错误画面";fetch("https://example.invalid/")</script></body></html>'},directory,signal:new AbortController().signal});
    const bytes=fs.readFileSync(file);assert.ok(bytes.subarray(0,8).equals(png.subarray(0,8)));assert.ok(bytes.length>2000);assert.equal(bytes.readUInt32BE(16),1440);assert.equal(bytes.readUInt32BE(20),960);
    assert.throws(()=>saveDesignReferences([{name:"fake.png",data:"data:image/png;base64,YmFk"}],directory),/格式与内容/);assert.throws(()=>saveDesignReferences(Array(4).fill({name:"ref",data:""}),directory),/最多附加/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test("Discarding refinement releases the previous proposal before slow capture teardown completes",async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"dh-role-discard-")),workspace=initialize(temp,{example:true}).workspace;let captures=0;
  const runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),capture:async({signal})=>{if(++captures===2)await new Promise((resolve,reject)=>signal.addEventListener("abort",()=>setTimeout(()=>reject(new Error("capture stopped")),300),{once:true}));return null;},run:async({directory,prompt})=>prompt.includes('User message: "讨论另一方案"')?{summary:"另一方案可正常讨论",files:[],controls:[]}:{summary:"调整标题",files:[changedFile(directory,"candidates/comfortable/pages/task.json",text=>{const spec=JSON.parse(text);spec.elements["task-page"].props.title="待确认方案";return JSON.stringify(spec);})],controls:[]}});
  try{const first=await settled(runtime,(await runtime.event(request(workspace,"visual"))).id),next=await runtime.event({...request(workspace,"visual"),baseJob:first.id}),discarding=runtime.event({type:"discard",job:next.id});
    const other=await runtime.event({...request(workspace,"visual"),candidate:"compact",prompt:"讨论另一方案"});assert.equal((await settled(runtime,other.id)).state,"answered");await discarding;
  }finally{await runtime.close();fs.rmSync(temp,{recursive:true,force:true});}
});

test("Screenshot preparation cannot replace the frozen source context with later external edits",async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"dh-role-snapshot-")),workspace=initialize(temp,{example:true}).workspace;let release,prompt;
  const gate=new Promise(resolve=>{release=resolve;}),runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),capture:async()=>{await gate;return null;},run:async input=>{prompt=input.prompt;return {summary:"讨论冻结的当前设计",files:[],controls:[]};}});
  try{const job=await runtime.event(request(workspace,"visual")),file=path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"),spec=readJson(file);spec.elements["task-page"].props.title="截图期间的外部修改";fs.writeFileSync(file,JSON.stringify(spec));release();assert.equal((await settled(runtime,job.id)).state,"answered");assert.doesNotMatch(prompt,/截图期间的外部修改/);
  }finally{release();await runtime.close();fs.rmSync(temp,{recursive:true,force:true});}
});

test("Current native popovers and canvas geometry remain visible in the static screenshot",async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"dh-popover-capture-")),{chromium}=await import("playwright"),{transform}=await import("esbuild"),browser=await chromium.launch({channel:"chrome",headless:true});
  try{const page=await browser.newPage({viewport:{width:900,height:900}});await page.setContent('<!doctype html><html><body><main data-jr-key="page">页面</main><div popover="manual" id="panel" style="inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;background:rgb(12,100,70)">已展开的选择面板</div></body></html>');
    const script=await transform(fs.readFileSync(new URL("../workbench/src/preview/capture.ts",import.meta.url),"utf8"),{loader:"ts",format:"iife",globalName:"captureTest"});await page.addScriptTag({content:script.code});
    const html=await page.evaluate(()=>{document.querySelector("#panel").showPopover();return window.captureTest.captureDocument();});assert.match(html,/data-dh-capture-popover/);
    const file=await captureDesignView({capture:{...capture,html,width:900,height:900},directory,signal:new AbortController().signal}),bytes=fs.readFileSync(file),chunks=[];
    for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset);if(bytes.toString("ascii",offset+4,offset+8)==="IDAT")chunks.push(bytes.subarray(offset+8,offset+8+length));offset+=length+12;}
    const pixels=inflateSync(Buffer.concat(chunks));assert.deepEqual([...pixels.subarray(1,4)],[12,100,70],"首像素应是展开面板的绿色，而非面板消失后的页面背景");
    const canvasHtml=await page.evaluate(()=>{document.querySelector("#panel").hidePopover();const canvas=document.createElement("canvas");canvas.className="drawn";const style=document.createElement("style");style.textContent="canvas.drawn{position:fixed;inset:0;width:100vw;height:100vh}";document.head.append(style);canvas.getContext("2d").fillStyle="rgb(12,100,70)";canvas.getContext("2d").fillRect(0,0,300,150);document.body.append(canvas);return window.captureTest.captureDocument();});
    const canvasFile=await captureDesignView({capture:{...capture,html:canvasHtml,width:900,height:900},directory,signal:new AbortController().signal}),canvasBytes=fs.readFileSync(canvasFile),canvasChunks=[];
    for(let offset=8;offset<canvasBytes.length;){const length=canvasBytes.readUInt32BE(offset);if(canvasBytes.toString("ascii",offset+4,offset+8)==="IDAT")canvasChunks.push(canvasBytes.subarray(offset+8,offset+8+length));offset+=length+12;}
    assert.deepEqual([...inflateSync(Buffer.concat(canvasChunks)).subarray(1,4)],[12,100,70],"canvas转换成图片后应保留标签专属CSS定义的实际位置和尺寸");
  }finally{await browser.close();fs.rmSync(directory,{recursive:true,force:true});}
});
