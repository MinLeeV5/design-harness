import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {testConnection,memoryPreferences} from "./helpers/codex-connection.mjs";
import {createExplorationFiles} from "../workbench/src/backend/adapters/exploration-files.mjs";

const text=input=>JSON.parse(input.prompt.match(/^User message: (.+)$/m)[1]);
const directions=[{title:"明确分组",brief:"明确分组与主操作"},{title:"渐进展开",brief:"逐步组织信息与操作"},{title:"紧凑工作区",brief:"紧凑任务组织"},{title:"辅助面板",brief:"保持主体与辅助区域"}];
const planning=(input,extra={})=>({summary:"方向与任务范围已明确，可以确认生成。",files:[],controls:[],ready:true,operation:"explore",base:"",pages:["task"],directions:directions.slice(0,input.schema.properties.directions.maxItems),...extra});
async function settled(runtime,job){const until=Date.now()+60000;while(Date.now()<until){const next=runtime.get(job.id,job.sessionId);if(!["running","validating","accepting"].includes(next.state))return next;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error("方案未在限定时间内完成");}
async function until(check){const end=Date.now()+30000;while(!check()){assert.ok(Date.now()<end,"等待条件超时");await new Promise(resolve=>setTimeout(resolve,10));}}
function worker(input){const message=text(input),label=message.match(/独立方案 ([A-Z](?:-[A-Z])*)/)?.[1],file=path.join(input.directory,"requirements/example/candidates/comfortable/pages/task.json"),spec=JSON.parse(fs.readFileSync(file));spec.elements["task-page"].props.title="方案 "+label;spec.elements["task-form"].props.radius=({A:8,B:20,C:4,D:20}[label]??spec.elements["task-form"].props.radius);return {summary:"已生成 "+label,files:[{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec)}],controls:[]};}
async function fixture(run,check,options={}){const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-agent-exploration-")),workspace=initialize(base,{example:true}).workspace,create=()=>createLiveAgentRuntime(workspace,{run,capture:async()=>null,connection:testConnection(),preferences:memoryPreferences(),...options});let runtime=create();const restart=async()=>{await runtime.close();runtime=create();return runtime;};try{await check({workspace,get runtime(){return runtime;},restart});}finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}}
const request=(workspace,extra={})=>({type:"message",role:"visual",id:"example",candidate:"comfortable",page:"task",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision,prompt:"探索三个方案",explore:{count:3,pages:["task"]},...extra});
const confirm=(runtime,job)=>runtime.event({type:"exploration",action:"confirm",job:job.id,sessionId:job.sessionId,planVersion:job.exploration.planVersion});
const source=workspace=>path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json");

test("Discussion never starts workers until the current plan is confirmed, then all N workers start together",async()=>{
  let turns=0,release;const workers=[],barrier=new Promise(resolve=>{release=resolve;});
  await fixture(async input=>{if(input.schema.properties.directions)return planning(input,++turns===1?{ready:false,directions:[],summary:"请明确本轮希望保留的内容。"}:{});workers.push(input);await barrier;return worker(input);},async({workspace,runtime})=>{
    const before=fs.readFileSync(source(workspace)),revision=loadRequirement(workspace,"example").revision;
    let job=await settled(runtime,await runtime.event(request(workspace)));assert.equal(job.exploration.phase,"discussing");assert.equal(job.exploration.plan.ready,false);assert.equal(workers.length,0);await assert.rejects(confirm(runtime,job),/先与主 Agent/);
    job=await settled(runtime,await runtime.event(request(workspace,{sessionId:job.sessionId,prompt:"保留内容，比较三种布局"})));assert.equal(job.exploration.plan.ready,true);assert.equal(workers.length,0);
    await assert.rejects(runtime.event({type:"exploration",action:"confirm",job:job.id,sessionId:job.sessionId,planVersion:job.exploration.planVersion-1}),/已更新/);
    await confirm(runtime,job);await until(()=>workers.length===3);assert.equal(new Set(workers.map(input=>input.session.id)).size,3);assert.equal(new Set(workers.map(input=>input.directory)).size,3);release();
    job=await settled(runtime,job);assert.equal(job.exploration.options.filter(option=>option.state==="ready").length,3,JSON.stringify(job.exploration.options.map(option=>option.error)));assert.equal(job.exploration.count,3);assert.deepEqual(fs.readFileSync(source(workspace)),before);assert.equal(loadRequirement(workspace,"example").revision,revision);assert.equal(runtime.sessions("example","comfortable").length,1);
  });
});

test("Cross-option feedback creates D, preserves A/B/C, refines versions and explores three children from D",async()=>{
  await fixture(async input=>{
    if(input.schema.properties.directions){const message=text(input);return planning(input,message.includes("融合")?{operation:"fuse",base:"a",directions:[{title:"融合",brief:"保留 A 的组织，采用 B 的圆角"}]}:message.includes("细化")?{operation:"refine",base:"d",directions:[{title:"细化 D",brief:"保留已选内容，细化标题"}]}:{});}
    if(text(input).includes("独立方案 D：")){const map=JSON.parse(input.prompt.match(/^Resource map: (.+)$/m)[1]),entry=map.entries.find(item=>item.path.endsWith("options.json"));assert.ok(entry,"融合必须获得具体源版本");const references=JSON.parse(fs.readFileSync(entry.path));assert.ok(references.some(item=>item.label==="A"));assert.ok(references.some(item=>item.label==="B"));}
    return worker(input);
  },async({workspace,runtime})=>{
    let job=await settled(runtime,await runtime.event(request(workspace)));await confirm(runtime,job);job=await settled(runtime,job);const originals=job.exploration.options.map(option=>option.version);
    job=await settled(runtime,await runtime.event(request(workspace,{sessionId:job.sessionId,explore:undefined,prompt:"融合 A 的组织与 B 的圆角"})));assert.equal(job.exploration.options.length,4,JSON.stringify({state:job.state,error:job.error,phase:job.exploration.phase,plan:job.exploration.plan}));assert.equal(job.exploration.count,3);assert.deepEqual(job.exploration.options.slice(0,3).map(option=>option.version),originals);assert.equal(job.exploration.options[3].label,"D");assert.equal(job.exploration.options[3].proposal.spec.elements["task-form"].props.radius,20);
    job=await settled(runtime,await runtime.event(request(workspace,{sessionId:job.sessionId,explore:undefined,prompt:"细化 D 的标题"})));assert.equal(job.exploration.options.length,4);assert.equal(job.exploration.options[3].versions.length,2);assert.equal(job.exploration.count,3);
    const parent=job.exploration.id;job=await settled(runtime,await runtime.event({...request(workspace),type:"exploration",action:"reexplore",job:job.id,sessionId:job.sessionId,count:3,prompt:"基于当前 D 保留内容，探索三个布局"}));assert.equal(job.exploration.parent.label,"D");assert.equal(job.exploration.parent.group,parent);assert.equal(job.exploration.options.length,0);await confirm(runtime,job);job=await settled(runtime,job);assert.deepEqual(job.exploration.options.map(option=>option.label),["D-A","D-B","D-C"]);assert.ok(job.exploration.options.every(option=>option.proposal.spec.elements["task-form"].props.radius===20));assert.equal(runtime.history("example","comfortable").groups.length,2);
  });
});

test("Saved interaction alternatives survive restart and can continue under the visual identity before acceptance",async()=>{
  await fixture(input=>{if(input.schema.properties.directions&&text(input).includes("视觉细化")){const map=JSON.parse(input.prompt.match(/^Resource map: (.+)$/m)[1]),entry=map.entries.find(item=>item.path.endsWith("exploration.json"));assert.ok(entry,"重建线程必须获得已保存设计讨论");const history=JSON.parse(fs.readFileSync(entry.path));assert.ok(history.discussion.some(message=>message.content.includes("探索三个方案")));}if(input.schema.properties.directions)return planning(input,text(input).includes("视觉细化")?{operation:"refine",base:"a",directions:[{title:"视觉细化",brief:"保留交互结论，调整视觉"}]}:{});const result=worker(input);if(input.prompt.startsWith("You are the 交互设计 identity"))result.files.push({path:"requirement.md",content:fs.readFileSync(path.join(input.directory,"requirements/example/requirement.md"),"utf8")+"\n已确认交互组织。\n"});return result;},async context=>{
    const {workspace}=context;let runtime=context.runtime,job=await settled(runtime,await runtime.event(request(workspace,{role:"interaction"})));await confirm(runtime,job);job=await settled(runtime,job);assert.equal(job.exploration.options[0].state,"ready",job.exploration.options[0].error);const group=job.exploration.id;
    runtime=await context.restart();const history=runtime.history("example","comfortable");assert.equal(history.groups[0].id,group);job=await runtime.event({type:"exploration",action:"open",id:"example",candidate:"comfortable",group});assert.equal(job.exploration.options[0].state,"ready",job.exploration.options[0].error);
    await runtime.saveSettings("example","comfortable",{identity:"visual"},job.sessionId);job=await settled(runtime,await runtime.event(request(workspace,{sessionId:job.sessionId,role:"visual",explore:undefined,prompt:"视觉细化 A，保留交互结论"})));assert.equal(job.exploration.options[0].versions.length,2,JSON.stringify({error:job.error,option:job.exploration.options[0].error,phase:job.exploration.phase,plan:job.exploration.plan}));assert.match(job.exploration.options[0].proposal.documentation,/已确认交互组织/);
    await runtime.event({type:"accept",job:job.id,sessionId:job.sessionId});assert.match(fs.readFileSync(path.join(workspace,"requirements/example/requirement.md"),"utf8"),/已确认交互组织/);assert.equal(runtime.history("example","comfortable").groups.length,1);
  });
});

test("The displayed historical version is used for refinement, fusion, re-exploration and tuned acceptance",async()=>{
  const inputs=[];let generation=0;
  await fixture(input=>{
    const spec=JSON.parse(fs.readFileSync(path.join(input.directory,"requirements/example/candidates/comfortable/pages/task.json"))),message=text(input);
    if(input.schema.properties.directions)return planning(input,message.includes("融合")?{operation:"fuse",base:"a",directions:[{title:"融合",brief:"保留当前 A 版本并融合 B"}]}:message.includes("细化")?{operation:"refine",base:"a",directions:[{title:"细化",brief:"基于正在看的 A 版本细化"}]}:{});
    inputs.push(spec.elements["task-page"].props.title);spec.elements["task-page"].props.title="生成版本 "+ ++generation;
    return {summary:"独立版本",files:[{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec)}],controls:[{id:"rounding",label:"圆角",type:"range",binding:"prop",target:"task-form",property:"radius",min:4,max:28,step:2,unit:"px"}]};
  },async({workspace,runtime})=>{
    let job=await settled(runtime,await runtime.event(request(workspace,{explore:{count:2,pages:["task"]}})));await confirm(runtime,job);job=await settled(runtime,job);const group=job.exploration.id,first=job.exploration.options[0];assert.equal(first.state,"ready",first.error);const v1=first.version,title=first.proposal.spec.elements["task-page"].props.title;
    const send=async prompt=>{job=await settled(runtime,await runtime.event(request(workspace,{sessionId:job.sessionId,explore:undefined,prompt})));};
    const selectFirst=async()=>{job=await runtime.event({type:"exploration",action:"version",job:job.id,sessionId:job.sessionId,option:"a",version:v1});};
    await send("细化 A");assert.equal(job.exploration.options[0].versions.length,2);
    await selectFirst();await send("细化当前 A 的旧版");assert.equal(inputs.at(-1),title);assert.equal(job.exploration.options[0].versions.length,3);
    await selectFirst();await send("融合当前 A 与 B");assert.equal(inputs.at(-1),title);assert.equal(job.exploration.options.length,3);
    await selectFirst();job=await settled(runtime,await runtime.event({...request(workspace),type:"exploration",action:"reexplore",sessionId:job.sessionId,job:job.id,count:2}));assert.equal(job.exploration.parent.version,v1);assert.equal(job.exploration.baseProposal.spec.elements["task-page"].props.title,title);
    job=await runtime.event({type:"exploration",action:"open",id:"example",candidate:"comfortable",group,sessionId:job.sessionId});await selectFirst();await runtime.event({type:"accept",job:job.id,sessionId:job.sessionId,values:{rounding:24}});
    const formal=JSON.parse(fs.readFileSync(source(workspace)));assert.equal(formal.elements["task-page"].props.title,title);assert.equal(formal.elements["task-form"].props.radius,24);
    const state=createExplorationFiles(workspace).read("example","comfortable"),saved=state.groups.find(item=>item.id===group).options[0],accepted=saved.versions.find(version=>version.id===saved.acceptedVersion),bytes=createExplorationFiles(workspace).contents("example","comfortable",accepted.snapshot);
    assert.notEqual(accepted.id,v1);assert.equal(JSON.parse(bytes.get("candidates/comfortable/pages/task.json")).elements["task-form"].props.radius,24);
  });
});

test("Restarted failed branches can retry, and opening a round transfers its active owner without losing versions",async()=>{
  let failB=true;
  await fixture(input=>{
    if(input.schema.properties.directions)return planning(input,text(input).includes("细化")?{operation:"refine",base:"a",directions:[{title:"细化",brief:"继续当前 A 方案"}]}:{});
    if(text(input).includes("独立方案 B")&&failB){failB=false;throw new Error("暂时失败");}
    const result=worker(input),spec=JSON.parse(result.files[0].content);spec.elements["task-page"].props.title+=" · 继续";result.files[0].content=JSON.stringify(spec);return result;
  },async context=>{
    const {workspace}=context;let runtime=context.runtime,job=await settled(runtime,await runtime.event(request(workspace,{explore:{count:2,pages:["task"]}})));await confirm(runtime,job);job=await settled(runtime,job);const group=job.exploration.id;assert.equal(job.exploration.options[1].state,"failed");
    runtime=await context.restart();job=await runtime.event({type:"exploration",action:"open",id:"example",candidate:"comfortable",group});await runtime.event({...request(workspace),type:"exploration",action:"retry",job:job.id,sessionId:job.sessionId,option:"b"});job=await settled(runtime,job);assert.equal(job.exploration.options[1].state,"ready",job.exploration.options[1].error);
    const previous=job,other=runtime.createSession("example","comfortable");job=await runtime.event({type:"exploration",action:"open",id:"example",candidate:"comfortable",group,sessionId:other.id});assert.equal(runtime.get(previous.id,previous.sessionId).state,"superseded");
    job=await settled(runtime,await runtime.event(request(workspace,{sessionId:job.sessionId,explore:undefined,prompt:"细化 A"})));assert.equal(job.exploration.options[0].versions.length,2);
    await assert.rejects(runtime.event({type:"exploration",action:"focus",job:previous.id,sessionId:previous.sessionId,option:"b"}),/已结束/);assert.equal(runtime.history("example","comfortable").groups[0].options[0].versions.length,2);
  });
});

test("Selecting a branch during refinement cannot replace the in-flight result with its previous version",async()=>{
  let release,started=false;const barrier=new Promise(resolve=>{release=resolve;});
  await fixture(async input=>{
    const message=text(input);if(input.schema.properties.directions)return planning(input,message.includes("细化")?{operation:"refine",base:"a",directions:[{title:"细化",brief:"更新标题"}]}:{});
    const result=worker(input);if(message.includes("细化")){started=true;await barrier;const spec=JSON.parse(result.files[0].content);spec.elements["task-page"].props.title="本次细化的结果";result.files[0].content=JSON.stringify(spec);}return result;
  },async({workspace,runtime})=>{
    let job=await settled(runtime,await runtime.event(request(workspace,{explore:{count:2,pages:["task"]}})));await confirm(runtime,job);job=await settled(runtime,job);job=await runtime.event(request(workspace,{sessionId:job.sessionId,explore:undefined,prompt:"细化 A 的标题"}));
    try{await until(()=>started);await assert.rejects(runtime.event({type:"exploration",action:"select",job:job.id,sessionId:job.sessionId,option:"a"}),/正在生成/);}finally{release();}
    job=await settled(runtime,job);assert.equal(job.exploration.options[0].versions.length,2);assert.equal(job.exploration.options[0].proposal.spec.elements["task-page"].props.title,"本次细化的结果");
  });
});

test("Switching options during planning cannot transfer another option's tuned values into the fusion baseline",async()=>{
  let release,planningStarted=false;const barrier=new Promise(resolve=>{release=resolve;});
  await fixture(async input=>{
    const message=text(input);if(input.schema.properties.directions){if(message.includes("融合")){planningStarted=true;await barrier;return planning(input,{operation:"fuse",base:"b",directions:[{title:"融合",brief:"以 B 为基线并保留 B 的间距"}]});}return planning(input);}
    const result=worker(input),spec=JSON.parse(result.files[0].content);if(message.includes("独立方案 A："))spec.elements["task-form"].props.gap=24;if(message.includes("独立方案 B："))spec.elements["task-form"].props.gap=20;result.files[0].content=JSON.stringify(spec);result.controls=[{id:"density",label:"间距",type:"range",binding:"prop",target:"task-form",property:"gap",min:12,max:36,step:4,unit:"px"}];return result;
  },async({workspace,runtime})=>{
    let job=await settled(runtime,await runtime.event(request(workspace,{explore:{count:2,pages:["task"]}})));await confirm(runtime,job);job=await settled(runtime,job);job=await runtime.event({type:"exploration",action:"select",job:job.id,sessionId:job.sessionId,option:"a"});job=await runtime.event(request(workspace,{sessionId:job.sessionId,explore:undefined,prompt:"以 B 为基线融合，并保留 B 的间距",values:{density:32}}));
    try{await until(()=>planningStarted);await runtime.event({type:"exploration",action:"select",job:job.id,sessionId:job.sessionId,option:"b"});}finally{release();}
    job=await settled(runtime,job);assert.equal(job.exploration.options.length,3);assert.equal(job.exploration.options[2].proposal.spec.elements["task-form"].props.gap,20);assert.equal(job.exploration.options[0].proposal.spec.elements["task-form"].props.gap,24);
  });
});
