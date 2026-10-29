import {testConnection} from "./helpers/codex-connection.mjs";
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {readJson} from "../workbench/src/backend/adapters/filesystem.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";

async function fixture(run,check){const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-agent-test-")),workspace=initialize(base,{example:true}).workspace,runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),run,capture:async()=>null});try{await check({workspace,runtime});}finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}}
const request=workspace=>({type:"generate",role:"visual",capture:{html:"<html><body>fixture</body></html>",width:1440,height:960,page:"task",state:{phase:"new"}},id:"example",candidate:"comfortable",page:"task",expectedRevision:loadRequirement(workspace,"example").revision,prompt:"更新标题"});
const update=directory=>{const spec=readJson(path.join(directory,"requirements/example/candidates/comfortable/pages/task.json"));spec.elements["task-page"].props.title="隔离生成标题";return {summary:"更新当前方案标题",files:[{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec,null,2)+"\n"}]};};
async function settled(runtime,id){
  // Typechecking and Chrome startup share CPU with the parallel distribution checks.
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const job=runtime.get(id);if(!["running","validating"].includes(job.state))return job;await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error("fixture did not settle: "+JSON.stringify(runtime.get(id)));
}

test("Live Agent previews independently, discards without writes and accepts only into the selected candidate",async()=>{
  let directory;
  await fixture(async input=>{directory=input.directory;return update(input.directory);},async({workspace,runtime})=>{
    const source=path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"),before=fs.readFileSync(source),other=fs.readFileSync(path.join(workspace,"requirements/example/candidates/compact/pages/task.json"));
    let generated=await runtime.event(request(workspace)),job=await settled(runtime,generated.id);assert.equal(job.state,"ready",job.error);assert.equal(job.proposal.spec.elements["task-page"].props.title,"隔离生成标题");assert.deepEqual(fs.readFileSync(source),before);
    await runtime.event({type:"discard",job:job.id});assert.equal(fs.existsSync(directory),false);assert.deepEqual(fs.readFileSync(source),before);
    generated=await runtime.event(request(workspace));job=await settled(runtime,generated.id);assert.equal(job.state,"ready",job.error);const completedAt=job.messages.at(-1).completedAt;await new Promise(resolve=>setTimeout(resolve,60));await runtime.event({type:"accept",job:job.id});assert.equal(runtime.get(job.id).messages.at(-1).completedAt,completedAt,"接受不应改变首次生成完成时间");assert.equal(readJson(source).elements["task-page"].props.title,"隔离生成标题");assert.deepEqual(fs.readFileSync(path.join(workspace,"requirements/example/candidates/compact/pages/task.json")),other);assert.equal(fs.existsSync(directory),false);assert.equal(fs.existsSync(path.join(workspace,"evidence")),false);
  });
});
test("Late usage and native progress cannot remove the ready preview's expiration timer",async t=>{
  let input;
  await fixture(async value=>{input=value;return update(value.directory);},async({workspace,runtime})=>{
    const job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"ready",job.error);
    t.mock.timers.enable({apis:["setTimeout"]});
    try{
      // A failed accept rearms the preserved preview, under the controlled clock.
      await assert.rejects(runtime.event({type:"accept",job:job.id,values:{unknown:1}}),/未生成/);
      input.onProgress();input.onObservation({kind:"usage",usage:{total:{inputTokens:20,outputTokens:5,totalTokens:25}}});
      t.mock.timers.tick(30*60000);assert.equal(runtime.get(job.id).state,"discarded");
    }finally{t.mock.timers.reset();}
  });
});

test("Accept refuses external resource edits and retains the generated proposal",async()=>{
  await fixture(async({directory})=>update(directory),async({workspace,runtime})=>{const generated=await runtime.event(request(workspace)),job=await settled(runtime,generated.id);assert.equal(job.state,"ready",job.error);const file=path.join(workspace,"foundation/tokens.css");fs.appendFileSync(file,"\n:root{--external-change:1}");await assert.rejects(runtime.event({type:"accept",job:job.id}),/源资源已被修改/);assert.equal(runtime.get(job.id).state,"ready");assert.match(fs.readFileSync(file,"utf8"),/external-change/);});
});
test("Agent output cannot traverse paths, edit another candidate or break the Catalog",async()=>{
  for(const make of [()=>({summary:"hidden source",files:[{path:"candidates/comfortable/.cache/helper.ts",content:"export const x=1"}]}),({directory})=>({summary:"remove annotation",files:[{path:"candidates/comfortable/components/Task.tsx",content:fs.readFileSync(path.join(directory,"requirements/example/candidates/comfortable/components/Task.tsx"),"utf8").replace('designPart("submit")','designPart("changed-submit")')}]}),()=>({summary:"bad",files:[{path:"candidates/comfortable/../../manifest.json",content:"{}"}]}),()=>({summary:"bad",files:[{path:"candidates/compact/pages/task.json",content:"{}"}]}),({directory})=>{const output=update(directory);output.files[0].content=output.files[0].content.replace('"TaskWorkspace"','"MissingComponent"');return output;}]){
    await fixture(async input=>make(input),async({workspace,runtime})=>{const before=fs.readFileSync(path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"));const generated=await runtime.event(request(workspace)),job=await settled(runtime,generated.id);assert.equal(job.state,"failed");assert.deepEqual(fs.readFileSync(path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json")),before);});
  }
});
test("Cancel aborts generation, cleans the transient workspace and makes acceptance impossible",async()=>{
  let directory;
  await fixture(({directory:dir,signal})=>{directory=dir;return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));},async({workspace,runtime})=>{const job=await runtime.event(request(workspace));await runtime.event({type:"cancel",job:job.id});assert.equal(runtime.get(job.id).state,"cancelled");assert.equal(fs.existsSync(directory),false);await assert.rejects(runtime.event({type:"accept",job:job.id}),/尚不可接受/);});
});

const selected={domId:"node-1",target:"task-form",instance:"",label:"任务表单",tag:"section",selector:".product-surface",html:'<section class="product-surface"></section>',styles:{padding:"24px"},ancestors:[{domId:"node-1",label:"任务表单"}]};
const gapControl={id:"density",label:"内容疏密",type:"range",binding:"prop",target:"task-form",property:"gap",min:12,max:36,step:4,unit:"px"};
test("Chat answers without edits, carries element and conversation context, and isolates candidate threads",async()=>{
  const prompts=[],sessions=[],selections=[];await fixture(async input=>{const map=JSON.parse(input.prompt.match(/^Resource map: (.+)$/m)[1]),entry=map.entries.find(e=>e.path.endsWith("/selection.json"));selections.push(entry?readJson(entry.path):null);prompts.push(input.prompt);sessions.push(input.session);return {summary:"先保持清晰的主次关系。",files:[],controls:[]};},async({workspace,runtime})=>{
    const file=path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"),before=fs.readFileSync(file);
    let job=await settled(runtime,(await runtime.event({...request(workspace),type:"message",prompt:"这个表单如何改善？",selection:selected})).id);assert.equal(job.state,"answered");assert.equal(job.proposal,undefined);assert.equal(job.messages.length,2);assert.equal(job.messages[0].selection.target,"task-form");
    job=await settled(runtime,(await runtime.event({...request(workspace),type:"message",prompt:"展开解释上一条建议"})).id);assert.equal(job.state,"answered");assert.equal(job.messages.length,4);assert.equal(sessions[1],sessions[0]);assert.doesNotMatch(prompts[1],/这个表单如何改善/);assert.equal(selections[0].selector,".product-surface");assert.doesNotMatch(prompts[0],/product-surface/);assert.equal(runtime.session("example","compact").messages.length,0);assert.deepEqual(fs.readFileSync(file),before);
    const withoutSelection=await settled(runtime,(await runtime.event({...request(workspace),type:"message",prompt:"没有附件也可以讨论"})).id);assert.equal(withoutSelection.state,"answered");
  });
});
test("Generated controls tune the actual staged Spec; refinement uses that preview and accept bakes values",async()=>{
  let turn=0;await fixture(async input=>{turn++;const file=path.join(input.directory,"requirements/example/candidates/comfortable/pages/task.json"),spec=readJson(file);if(turn===1){spec.elements["task-page"].props.title="先调整视觉结构";}else{assert.equal(spec.elements["task-form"].props.gap,20);assert.equal(spec.elements["task-page"].props.title,"先调整视觉结构");spec.elements["task-page"].props.title="保留结构，继续微调";}return {summary:"调整表单内容疏密",files:[{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec,null,2)+"\n"}],controls:[gapControl]};},async({workspace,runtime})=>{
    const file=path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"),before=fs.readFileSync(file),other=fs.readFileSync(path.join(workspace,"requirements/example/candidates/compact/pages/task.json"));
    let job=await settled(runtime,(await runtime.event({...request(workspace),selection:selected})).id);assert.equal(job.state,"ready",job.error);assert.equal(job.proposal.controls[0].label,"内容疏密");assert.deepEqual(fs.readFileSync(file),before);
    await assert.rejects(runtime.event({type:"accept",job:job.id,values:{unknown:1}}),/未生成/);await assert.rejects(runtime.event({type:"accept",job:job.id,values:{density:101}}),/超出范围/);
    const original=job.id;job=await settled(runtime,(await runtime.event({...request(workspace),type:"message",selection:selected,baseJob:job.id,values:{density:20},prompt:"保留当前结构再改善标题"})).id);assert.equal(job.state,"ready",job.error);assert.equal(runtime.get(original).state,"superseded");assert.deepEqual(fs.readFileSync(file),before);
    await runtime.event({type:"accept",job:job.id,values:{density:28}});assert.equal(readJson(file).elements["task-form"].props.gap,28);assert.equal(readJson(file).elements["task-page"].props.title,"保留结构，继续微调");assert.deepEqual(fs.readFileSync(path.join(workspace,"requirements/example/candidates/compact/pages/task.json")),other);assert.equal(runtime.session("example","comfortable").messages.at(-1).state,"accepted");
  });
});
test("CSS tuning must be authored and accepted into candidate params; unused or excess knobs fail",async()=>{
  for(const invalid of [false,true])await fixture(async({directory})=>{const root=path.join(directory,"requirements/example/candidates/comfortable"),params=readJson(path.join(root,"params.json"));params.css["--live-surface-space"]="24px";return {summary:"调整表单留白",files:[{path:"candidates/comfortable/params.json",content:JSON.stringify(params)},{path:"candidates/comfortable/components/task.css",content:fs.readFileSync(path.join(root,"components/task.css"),"utf8")+(invalid?'\n/* unbound */':'\n.product-surface{padding:var(--live-surface-space)}')}],controls:[{...gapControl,binding:"css",property:"--live-surface-space"}]};},async({workspace,runtime})=>{const job=await settled(runtime,(await runtime.event({...request(workspace),selection:selected})).id);assert.equal(job.state,invalid?"failed":"ready",job.error);if(invalid)assert.match(job.error,/实际样式/);else{await runtime.event({type:"accept",job:job.id,values:{density:32}});assert.equal(readJson(path.join(workspace,"requirements/example/candidates/comfortable/params.json")).css["--live-surface-space"],"32px");}});
});

test("Accept occupies the preview before awaiting validation; duplicate accept, cancel and refine cannot alter its values",async()=>{
 await fixture(async({directory})=>{const output=update(directory);return {...output,controls:[gapControl]};},async({workspace,runtime})=>{
  const job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"ready",job.error);
  const accepting=runtime.event({type:"accept",job:job.id,values:{density:20}});assert.equal(runtime.get(job.id).state,"accepting");
  await assert.rejects(runtime.event({type:"accept",job:job.id,values:{density:28}}),/尚不可接受/);await assert.rejects(runtime.event({type:"cancel",job:job.id}),/正被接受/);await assert.rejects(runtime.event({...request(workspace),baseJob:job.id}),/只能继续/);
  await accepting;assert.equal(readJson(path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json")).elements["task-form"].props.gap,20);
 });
});
test("Failed or cancelled refinement retains the last valid preview and its tuned values for acceptance",async()=>{
 for(const cancel of [false,true]){let turn=0;await fixture(async input=>{if(++turn===1)return {...update(input.directory),controls:[gapControl]};if(cancel)return new Promise((resolve,reject)=>input.signal.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true}));throw new Error("refinement failed");},async({workspace,runtime})=>{
  const first=await settled(runtime,(await runtime.event(request(workspace))).id),next=await runtime.event({...request(workspace),type:"message",baseJob:first.id,values:{density:20},prompt:"继续调整"});
  const recovered=cancel?await runtime.event({type:"cancel",job:next.id}):await settled(runtime,next.id);assert.equal(recovered.state,"ready",recovered.error);assert.match(recovered.error,/上一版预览已保留/);assert.equal(recovered.proposal.spec.elements["task-form"].props.gap,20);assert.equal(recovered.messages.at(-1).activity.find(item=>item.id==="request").status,cancel?"cancelled":"failed");assert.equal(recovered.proposal.spec.elements["task-page"].props.title,"隔离生成标题");
  await runtime.event({type:"accept",job:recovered.id,values:{density:28}});assert.equal(readJson(path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json")).elements["task-form"].props.gap,28);
 });}
});
test("Generated controls reject duplicate bindings and excess knobs",async()=>{
 const {validateControls}=await import("../workbench/src/contracts/agent-controls.mjs");await fixture(async()=>({summary:"ok",files:[]}),async({workspace})=>{const spec=loadRequirement(workspace,"example").specs["comfortable:task"];assert.throws(()=>validateControls([gapControl,{...gapControl,id:"another"}],spec,{}),/同一写回目标/);assert.throws(()=>validateControls(Array.from({length:5},(_,i)=>({...gapControl,id:"knob-"+i})),spec,{}),/最多提供4项/);});
});
test("Failed accept restores the staged snapshot so retrying the same invalid Catalog value cannot report success",async()=>{
 await fixture(async({directory})=>{const root=path.join(directory,"requirements/example/candidates/comfortable"),spec=readJson(path.join(root,"pages/task.json")),catalog=fs.readFileSync(path.join(root,"catalog.ts"),"utf8").replace('title:z.string()','title:z.enum(["原始枚举标题","新枚举标题"])');spec.elements["task-page"].props.title="原始枚举标题";return {summary:"准备标题方案",files:[{path:"candidates/comfortable/catalog.ts",content:catalog},{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec)}],controls:[{id:"title-choice",label:"标题选择",type:"text",binding:"prop",target:"task-page",property:"title",min:0,max:0,step:1,unit:""}]};},async({workspace,runtime})=>{
  const file=path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"),before=fs.readFileSync(file),job=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(job.state,"ready",job.error);
  for(let i=0;i<2;i++){await assert.rejects(runtime.event({type:"accept",job:job.id,values:{"title-choice":"非法枚举标题"}}),/Catalog/);assert.equal(runtime.get(job.id).state,"ready");assert.deepEqual(fs.readFileSync(file),before);}
  await runtime.event({type:"accept",job:job.id,values:{"title-choice":"新枚举标题"}});assert.equal(readJson(file).elements["task-page"].props.title,"新枚举标题");const attempts=runtime.get(job.id).messages.at(-1).activity.filter(item=>item.id.startsWith("accept-"));assert.equal(attempts.length,3);assert.deepEqual(attempts.map(item=>item.status),["failed","failed","done"]);
 });
});

test("Agent records real turn activity, final replies and failures in complete candidate history",async()=>{
 let rejectTurn,resolveTurn;const gate=new Promise((resolve,reject)=>{resolveTurn=resolve;rejectTurn=reject;});
 await fixture(async({onEvent})=>{onEvent({id:"codex-turn",label:"生成回复或设计修改",status:"running"});return gate;},async({workspace,runtime})=>{
  const started=await runtime.event({...request(workspace),type:"message"});assert.equal(started.messages.length,2);await waitFor(()=>runtime.get(started.id).messages.at(-1).activity.some(item=>item.id==="codex-turn"));const waiting=runtime.session("example","comfortable").messages.at(-1);assert.equal(waiting.state,"running");assert.ok(waiting.activity.some(item=>item.id==="codex-turn"&&item.status==="running"));
  resolveTurn({summary:"已核对布局。",files:[],controls:[]});const done=await settled(runtime,started.id);assert.equal(done.messages.at(-1).content,"已核对布局。");assert.ok(done.messages.at(-1).activity.every(item=>item.status!=="running"));assert.ok(done.messages.at(-1).completedAt>=done.messages.at(-1).startedAt);
 });
 await fixture(async()=>{throw new Error("可见失败");},async({workspace,runtime})=>{const failed=await settled(runtime,(await runtime.event(request(workspace))).id);assert.equal(failed.messages.at(-1).state,"failed");assert.equal(failed.messages.at(-1).content,"可见失败");assert.equal(failed.messages.at(-1).activity.at(-1).status,"failed");});
 await fixture(async()=>({summary:"普通回复",files:[],controls:[]}),async({workspace,runtime})=>{for(let i=0;i<23;i++)await settled(runtime,(await runtime.event({...request(workspace),prompt:"消息 "+i})).id);const history=runtime.session("example","comfortable").messages;assert.equal(history.length,46);assert.equal(history[0].content,"消息 0");});
});

// Cancel after the model has returned while the asynchronous build is still pending.
test("Cancel during asynchronous validation cannot append running browser activity to a terminal turn",async()=>{
 await fixture(async input=>update(input.directory),async({workspace,runtime})=>{const started=await runtime.event(request(workspace));await waitFor(()=>runtime.get(started.id).messages.at(-1).activity.some(item=>item.id==="types"&&item.status==="running"));const stopped=await runtime.event({type:"cancel",job:started.id});assert.equal(stopped.state,"cancelled");assert.ok(stopped.messages.at(-1).activity.every(item=>item.status!=="running"));assert.equal(stopped.messages.at(-1).activity.some(item=>item.id==="browser"),false);});
});

async function waitFor(check){const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw new Error("state did not arrive");await new Promise(resolve=>setTimeout(resolve,5));}}
