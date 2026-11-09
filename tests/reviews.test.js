import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {createReviewService} from "../workbench/src/backend/services/reviews.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {testConnection,memoryPreferences} from "./helpers/codex-connection.mjs";

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0eUAAAAASUVORK5CYII=","base64");
const capture=async({directory})=>{const file=path.join(directory,"view.png");fs.writeFileSync(file,png);return file;};
const anchor={target:"task-form",instance:"",selector:"",tag:"form",text:"",x:0.2,y:0.3,view:{x:60,y:90,width:320,height:320}};
function body(workspace,extra={}){return {id:"example",candidate:"comfortable",page:"task",action:"create",expectedVersion:0,text:"请调整这里的间距",anchor,capture:{html:"<html></html>",width:320,height:320,page:"task",state:{}},designRevision:loadRequirement(workspace,"example").revision,...extra};}
async function open(workspace){const service=await startServer(workspace,{port:0,reviewCapture:capture,agentConnection:testConnection(),agentPreferences:memoryPreferences()});const html=await(await fetch(service.origin)).text(),data=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(html)[1]);
  const request=(route,method="GET",value,token=data.token)=>fetch(service.origin+route,{method,headers:{Origin:service.origin,"X-DH-Token":token,"Content-Type":"application/json"},...(value?{body:JSON.stringify(value)}:{})});
  return {...service,data,request};
}

test("Reviews, replies, state and screenshots survive server restart without changing the design revision",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-reviews-")),workspace=initialize(root,{example:true}).workspace;let service;
  try{
    service=await open(workspace);const revision=loadRequirement(workspace,"example").revision;
    assert.equal((await service.request("/__dh/reviews?id=example&candidate=comfortable","GET",null,"bad")).status,403);
    let response=await service.request("/__dh/reviews","POST",body(workspace));assert.equal(response.status,200);let value=await response.json();const id=value.threads[0].id;
    response=await service.request("/__dh/reviews","POST",{id:"example",candidate:"comfortable",thread:id,action:"reply",text:"已确认原画面",expectedVersion:value.version});assert.equal(response.status,200);value=await response.json();
    response=await service.request("/__dh/reviews","POST",{id:"example",candidate:"comfortable",thread:id,action:"resolve",expectedVersion:value.version});assert.equal(response.status,200);value=await response.json();
    assert.equal(value.threads[0].resolved,true);assert.equal(loadRequirement(workspace,"example").revision,revision);
    assert.equal((await service.request("/__dh/reviews/image?id=example&candidate=compact&thread="+id)).status,400);
    assert.deepEqual(Buffer.from(await(await service.request("/__dh/reviews/image?id=example&candidate=comfortable&thread="+id)).arrayBuffer()),png);
    await service.close();service=await open(workspace);const restored=await(await service.request("/__dh/reviews?id=example&candidate=comfortable")).json();assert.deepEqual(restored,value);
    assert.equal(restored.threads[0].replies[0].text,"已确认原画面");
    response=await service.request("/__dh/reviews","POST",{id:"example",candidate:"comfortable",thread:id,action:"reopen",expectedVersion:value.version});assert.equal(response.status,200);assert.equal((await response.json()).threads[0].resolved,false);
    assert.equal(loadRequirement(workspace,"example").revision,revision);
  }finally{await service?.close();fs.rmSync(root,{recursive:true,force:true});}
});

test("Concurrent replies preserve the winner; stale create leaves no orphan screenshot",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-cas-")),workspace=initialize(root,{example:true}).workspace;const reviews=createReviewService(workspace,{capture});
  try{
    const first=await reviews.create(body(workspace));const base={id:"example",candidate:"comfortable",thread:first.threads[0].id,expectedVersion:first.version,action:"reply"};
    const values=await Promise.allSettled(["one","two"].map(text=>Promise.resolve().then(()=>reviews.change({...base,text}))));assert.equal(values.filter(v=>v.status==="fulfilled").length,1);assert.match(values.find(v=>v.status==="rejected").reason.message,/批阅已更新/);
    await assert.rejects(reviews.create(body(workspace)),/批阅已更新/);
    const folder=path.join(workspace,"reviews/example/comfortable");assert.equal(fs.readdirSync(folder).filter(name=>name.endsWith(".png")).length,1);
    assert.equal(reviews.read("example","comfortable").threads[0].replies.length,1);
    await assert.rejects(reviews.create(body(workspace,{anchor:{...anchor,x:2}})),/位置无效/);
    await assert.rejects(reviews.create(body(workspace,{candidate:"../outside"})),/归属标识无效/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("Proposal origin outlives temporary sessions; accepted and discarded records retain the screenshot",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-origin-")),workspace=initialize(root,{example:true}).workspace;const reviews=createReviewService(workspace,{capture}),proposalId="1".repeat(32);
  try{
    const first=await reviews.create(body(workspace,{proposalId}),()=>({kind:"proposal",proposalId,state:"ready",revision:"original"}));
    reviews.origin("example","comfortable",proposalId,"accepted");assert.equal(reviews.read("example","comfortable").threads[0].source.state,"accepted");assert.equal(reviews.read("example","comfortable").threads[0].resolved,false);
    const second="2".repeat(32);await reviews.create(body(workspace,{proposalId:second,expectedVersion:2}),()=>({kind:"proposal",proposalId:second,state:"ready",revision:"original"}));
    const restarted=createReviewService(workspace,{capture});const value=restarted.read("example","comfortable");assert.equal(value.threads[1].source.state,"unavailable");assert.equal(value.threads[0].source.state,"accepted");assert.deepEqual(fs.readFileSync(restarted.image("example","comfortable",first.threads[0].id)),png);
    restarted.origin("example","comfortable",second,"discarded");assert.equal(restarted.read("example","comfortable").threads[1].source.state,"discarded");
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("Review storage rejects symbolic link directories and preserves damaged records",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-boundary-")),workspace=initialize(root,{example:true}).workspace;
  try{
    const reviews=createReviewService(workspace,{capture}),outside=path.join(root,"outside");fs.mkdirSync(outside);fs.rmdirSync(path.join(workspace,"reviews"));fs.symlinkSync(outside,path.join(workspace,"reviews"));
    assert.throws(()=>reviews.read("example","comfortable"),/软链接/);assert.equal(fs.readdirSync(outside).length,0);
    fs.unlinkSync(path.join(workspace,"reviews"));await reviews.create(body(workspace));const file=path.join(workspace,"reviews/example/comfortable/threads.json");fs.writeFileSync(file,"{broken");assert.throws(()=>reviews.read("example","comfortable"));assert.equal(fs.readFileSync(file,"utf8"),"{broken");
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("Agent reads all cross-page review screenshots independently of reference slots; acceptance, discard and restart retain origins",{timeout:120000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-agent-")),workspace=initialize(root,{example:true}).workspace,folder=path.join(workspace,"requirements/example"),reviews=createReviewService(workspace,{capture});let runtime;
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json")));manifest.pages.push({id:"details",title:"详情"});for(const c of manifest.candidates){c.pages.details=c.pages.task.replace("task.json","details.json");fs.copyFileSync(path.join(folder,c.pages.task),path.join(folder,c.pages.details));}fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest));const scenarios=JSON.parse(fs.readFileSync(path.join(folder,"scenarios.json")));scenarios.push({id:"details-start",page:"details",title:"详情初始状态",state:{phase:"new"}});fs.writeFileSync(path.join(folder,"scenarios.json"),JSON.stringify(scenarios));
  const until=async(job,state)=>{const deadline=Date.now()+45000;for(;;){const value=runtime.get(job.id,job.sessionId);if(value.state===state)return value;assert.ok(!["failed","answered"].includes(value.state),JSON.stringify(value));assert.ok(Date.now()<deadline,"提案未完成");await new Promise(resolve=>setTimeout(resolve,25));}};
  const request=session=>({type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"visual",page:"task",prompt:"按批阅调整页面标题",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision});
  try{
    for(let i=0;i<4;i++){const page=i%2?"details":"task";await reviews.create(body(workspace,{page,capture:{html:"<html></html>",width:320,height:320,page,state:{}},expectedVersion:i,text:"跨页评语 "+i}));}
    const selected=reviews.read("example","comfortable").threads;let turns=0;
    runtime=createLiveAgentRuntime(workspace,{reviews,preferences:memoryPreferences(),connection:testConnection(),capture:async()=>null,run:async input=>{
      const map=JSON.parse(input.prompt.match(/^Resource map: (.+)$/m)[1]);if(turns++===0){const notes=JSON.parse(fs.readFileSync(map.entries.find(e=>e.path.endsWith("/reviews.json")).path));assert.equal(notes.length,4);assert.equal(new Set(notes.map(t=>t.page)).size,2);const images=map.entries.filter(e=>/review-[a-f0-9]{32}\.png$/.test(e.path));assert.equal(images.length,4);for(const entry of images)assert.deepEqual(fs.readFileSync(entry.path),png);assert.equal(input.imageFiles.length,3);}
      const relative="candidates/comfortable/pages/task.json",spec=JSON.parse(fs.readFileSync(path.join(input.directory,"requirements/example",relative)));spec.elements["task-page"].props.title+=" · 批阅调整";return {summary:"已读取批阅并调整标题",files:[{path:relative,content:JSON.stringify(spec)}],controls:[]};
    }});
    const session=runtime.createSession("example","comfortable"),job=await runtime.event({...request(session),reviewIds:selected.map(t=>t.id),references:[1,2,3].map(n=>({name:"参考图 "+n,data:"data:image/png;base64,"+png.toString("base64")}))});const ready=await until(job,"ready");assert.equal(ready.proposal.jobId,job.id);assert.equal(ready.messages[0].reviews.length,4);
    const originalRevision=loadRequirement(workspace,"example").revision;
    await reviews.create(body(workspace,{page:"details",capture:{html:"<html></html>",width:320,height:320,page:"details",state:{}},proposalId:job.id,expectedVersion:reviews.read("example","comfortable").version}),(...args)=>runtime.reviewSource(...args));
    const pending=reviews.read("example","comfortable").threads.at(-1);assert.equal(pending.source.state,"ready");assert.equal(loadRequirement(workspace,"example").revision,originalRevision);
    assert.throws(()=>runtime.reviewSource("example","compact",job.id),/不属于当前方案/);
    const accepted=await runtime.event({type:"accept",job:job.id,sessionId:session.id,values:{}});assert.equal(accepted.state,"accepted");assert.equal(reviews.read("example","comfortable").threads.at(-1).source.state,"accepted");assert.ok(reviews.read("example","comfortable").threads.every(t=>!t.resolved));
    const nextSession=runtime.createSession("example","comfortable"),nextJob=await runtime.event(request(nextSession));await until(nextJob,"ready");await reviews.create(body(workspace,{proposalId:nextJob.id,expectedVersion:reviews.read("example","comfortable").version}),(...args)=>runtime.reviewSource(...args));const discarded=reviews.read("example","comfortable").threads.at(-1);
    await runtime.event({type:"discard",job:nextJob.id,sessionId:nextSession.id});assert.equal(reviews.get("example","comfortable",discarded.id).source.state,"discarded");assert.deepEqual(fs.readFileSync(reviews.image("example","comfortable",discarded.id)),png);
    await runtime.close();runtime=null;const restored=createReviewService(workspace,{capture});assert.equal(restored.get("example","comfortable",pending.id).source.state,"accepted");assert.equal(restored.get("example","comfortable",discarded.id).source.state,"discarded");
  }finally{await runtime?.close();fs.rmSync(root,{recursive:true,force:true});}
});

test("Expiring a proposal preserves its review and records expiration separately from user discard",{timeout:60000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-expiry-")),workspace=initialize(root,{example:true}).workspace,reviews=createReviewService(workspace,{capture});let runtime;
  try{
    runtime=createLiveAgentRuntime(workspace,{reviews,previewTimeoutMs:800,preferences:memoryPreferences(),connection:testConnection(),capture:async()=>null,run:async input=>{const file="candidates/comfortable/pages/task.json",spec=JSON.parse(fs.readFileSync(path.join(input.directory,"requirements/example",file)));spec.elements["task-page"].props.title="过期提案";return {summary:"待评审",files:[{path:file,content:JSON.stringify(spec)}],controls:[]};}});
    const session=runtime.createSession("example","comfortable"),job=await runtime.event({type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"visual",page:"task",prompt:"调整标题",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision});let deadline=Date.now()+30000;
    while(runtime.get(job.id,session.id).state!=="ready"){assert.ok(Date.now()<deadline,JSON.stringify(runtime.get(job.id,session.id)));await new Promise(r=>setTimeout(r,10));}
    await reviews.create(body(workspace,{proposalId:job.id}),(...args)=>runtime.reviewSource(...args));const thread=reviews.read("example","comfortable").threads[0];deadline=Date.now()+3000;
    while(runtime.reviewStatus("example","comfortable",job.id)!=="expired"){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,20));}
    assert.equal(reviews.get("example","comfortable",thread.id).source.state,"expired");assert.equal(reviews.get("example","comfortable",thread.id).resolved,false);await runtime.close();runtime=null;
    const restored=createReviewService(workspace,{capture});assert.equal(restored.get("example","comfortable",thread.id).source.state,"expired");assert.deepEqual(fs.readFileSync(restored.image("example","comfortable",thread.id)),png);
  }finally{await runtime?.close();fs.rmSync(root,{recursive:true,force:true});}
});

for(const outcome of ["failure","cancel"])test("Recovered refinement keeps a usable review source and successor history: "+outcome,{timeout:60000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-recovery-")),workspace=initialize(root,{example:true}).workspace,reviews=createReviewService(workspace,{capture});let runtime,turns=0,started=false;
  const wait=async predicate=>{const deadline=Date.now()+30000;while(!predicate()){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,10));}};
  try{
    runtime=createLiveAgentRuntime(workspace,{reviews,preferences:memoryPreferences(),connection:testConnection(),capture:async()=>null,run:async input=>{if(turns++>0){started=true;if(outcome==="failure")throw new Error("refinement fixture failed");return new Promise((_,reject)=>input.signal.addEventListener("abort",()=>reject(new Error("cancelled fixture")),{once:true}));}const file="candidates/comfortable/pages/task.json",spec=JSON.parse(fs.readFileSync(path.join(input.directory,"requirements/example",file)));spec.elements["task-page"].props.title="保留的上一版提案";return {summary:"首版提案",files:[{path:file,content:JSON.stringify(spec)}],controls:[]};}});
    const session=runtime.createSession("example","comfortable"),request={type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"visual",page:"task",prompt:"调整标题",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision},first=await runtime.event(request);await wait(()=>runtime.get(first.id,session.id).state==="ready");
    await reviews.create(body(workspace,{proposalId:first.id}),(...args)=>runtime.reviewSource(...args));const original=reviews.read("example","comfortable").threads[0];
    const second=await runtime.event({...request,baseJob:first.id});await wait(()=>started);if(outcome==="cancel")await runtime.event({type:"cancel",sessionId:session.id,job:second.id});await wait(()=>runtime.get(second.id,session.id).state==="ready");const recovered=runtime.get(second.id,session.id);assert.equal(recovered.proposal.jobId,second.id);assert.notEqual(recovered.proposal.jobId,first.id);
    assert.equal(reviews.get("example","comfortable",original.id).source.successor.proposalId,second.id);assert.equal(reviews.get("example","comfortable",original.id).source.successor.state,"ready");
    await reviews.create(body(workspace,{proposalId:recovered.proposal.jobId,expectedVersion:reviews.read("example","comfortable").version}),(...args)=>runtime.reviewSource(...args));const newer=reviews.read("example","comfortable").threads.at(-1);assert.equal(newer.source.state,"ready");
    await runtime.event({type:"accept",sessionId:session.id,job:second.id,values:{}});assert.equal(reviews.get("example","comfortable",original.id).source.successor.state,"accepted");assert.equal(reviews.get("example","comfortable",newer.id).source.state,"accepted");await runtime.close();runtime=null;
    assert.equal(createReviewService(workspace,{capture}).get("example","comfortable",original.id).source.successor.state,"accepted");
  }finally{await runtime?.close();fs.rmSync(root,{recursive:true,force:true});}
});

test("Pending new pages use the proposal manifest for review validation; abandoned page records remain readable",{timeout:60000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-new-page-")),workspace=initialize(root,{example:true}).workspace,reviews=createReviewService(workspace,{capture});let runtime;
  try{
    runtime=createLiveAgentRuntime(workspace,{reviews,preferences:memoryPreferences(),connection:testConnection(),capture:async()=>null,run:async input=>{const folder=path.join(input.directory,"requirements/example"),manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"))),scenarios=JSON.parse(fs.readFileSync(path.join(folder,"scenarios.json")));manifest.pages.push({id:"notes",title:"新增页面"});const files=[];for(const c of manifest.candidates){c.pages.notes="candidates/"+c.id+"/pages/notes.json";files.push({path:c.pages.notes,content:JSON.stringify({root:"note",elements:{note:{type:"TaskWorkspace",props:{title:"新页面"},children:[]}}})});}scenarios.push({id:"notes-open",page:"notes",title:"新增页初始状态",state:{}});return {summary:"新增页面",files:[{path:"manifest.json",content:JSON.stringify(manifest)},{path:"scenarios.json",content:JSON.stringify(scenarios)},...files],controls:[]};}});
    const session=runtime.createSession("example","comfortable"),job=await runtime.event({type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"interaction",page:"task",prompt:"增加页面",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision});const deadline=Date.now()+30000;while(runtime.get(job.id,session.id).state!=="ready"){assert.ok(Date.now()<deadline,JSON.stringify(runtime.get(job.id,session.id)));await new Promise(r=>setTimeout(r,10));}
    const input=body(workspace,{page:"notes",capture:{html:"<html></html>",width:320,height:320,page:"notes",state:{}}});await assert.rejects(reviews.create(input),/页面不存在/);
    await reviews.create({...input,proposalId:job.id},(...args)=>runtime.reviewSource(...args));const thread=reviews.read("example","comfortable").threads[0];assert.equal(thread.page,"notes");assert.equal(thread.source.proposalId,job.id);assert.equal("pages" in thread.source,false);
    await runtime.event({type:"discard",sessionId:session.id,job:job.id});assert.equal(reviews.get("example","comfortable",thread.id).source.state,"discarded");assert.deepEqual(fs.readFileSync(reviews.image("example","comfortable",thread.id)),png);assert.equal(loadRequirement(workspace,"example").manifest.pages.some(p=>p.id==="notes"),false);
  }finally{await runtime?.close();fs.rmSync(root,{recursive:true,force:true});}
});
