import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {createCodexConnection,describeCodex,inspectCodex} from "../workbench/src/backend/adapters/codex-connection.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {testStatus,testConnection} from "./helpers/codex-connection.mjs";

test("Provider metadata exposes only display fields and distinguishes configured, authenticated and missing authentication",()=>{
  const config={model:"vision",model_provider:"custom",model_reasoning_effort:"high",model_providers:{custom:{name:"我的服务",base_url:"https://private.example",api_key:"secret-key"}}},catalog=[{model:"vision",displayName:"视觉模型",inputModalities:["text","image"]},{model:"text",inputModalities:["text"]},{model:"hidden",hidden:true}];
  const metadata=describeCodex(config,{account:{type:"chatgpt",email:"private@example.com",accessToken:"secret-token"},requiresOpenaiAuth:true},catalog);
  assert.equal(metadata.auth,"authenticated");assert.equal(metadata.models.length,2);assert.equal(metadata.models[1].images,false);assert.doesNotMatch(JSON.stringify(metadata),/private|secret|accessToken|api_key|base_url|email/);
  assert.equal(describeCodex(config,{account:null,requiresOpenaiAuth:false},catalog).auth,"external");assert.equal(describeCodex(config,{account:{type:"chatgpt"},requiresOpenaiAuth:false},catalog).authMode,"");assert.equal(describeCodex(config,{account:null,requiresOpenaiAuth:true},catalog).auth,"required");assert.equal(describeCodex(config,null,null).auth,"unknown");
});

test("Model discovery is cached and deduplicated, while refresh and real request outcomes remain independent of authentication",async()=>{
  let probes=0;const connection=createCodexConnection({inspect:async()=>{probes++;await new Promise(resolve=>setTimeout(resolve,10));return testStatus();}});
  await Promise.all([connection.read(),connection.read(),connection.read()]);assert.equal(probes,1);
  const selected=await connection.select("test-fast");assert.equal(selected.id,"test-fast");assert.equal(selected.effort,"low");assert.equal(probes,1);
  connection.record(selected,"failed");const failed=await connection.read();assert.equal(failed.auth,"authenticated");assert.equal(failed.lastRequest.state,"failed");
  connection.record(selected,"succeeded");assert.equal((await connection.read()).lastRequest.state,"succeeded");await connection.read({refresh:true});assert.equal(probes,2);
  await assert.rejects(connection.select("text-only"),/需要图片输入/);await assert.rejects(connection.select("missing"),/不在当前目录/);
  const missing=createCodexConnection({inspect:async()=>({...testStatus(),auth:"required"})});await assert.rejects(missing.select(),/本机登录/);
  const unavailable=createCodexConnection({inspect:async()=>{throw new Error("Codex 不可用");}});assert.equal((await unavailable.read()).available,false);await assert.rejects(unavailable.select(),/不可用/);
  const withoutCatalog=createCodexConnection({inspect:async()=>({...testStatus(),models:[],catalogAvailable:false})});assert.equal((await withoutCatalog.select()).id,"test-vision");await assert.rejects(withoutCatalog.select("test-fast"),/不在当前目录/);
});

function processFixture(handle){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{queueMicrotask(()=>child.emit("close",0));};let buffer="";child.stdin.on("data",bytes=>{buffer+=bytes.toString();let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line)handle(child,JSON.parse(line));}});return child;}
test("Read-only RPC discovery handles pagination and split UTF-8 without exposing account credentials",async()=>{
  const calls=[];let killed=false;const data=await inspectCodex({spawnProcess:()=>{const child=processFixture((child,request)=>{calls.push(request.method);if(!request.id)return;const result=request.method==="initialize"?{}:request.method==="config/read"?{config:{model_provider:"test",model:"one",model_providers:{test:{name:"视觉供应方"}}}}:request.method==="account/read"?{account:{type:"chatgpt",email:"hidden@example.com"},requiresOpenaiAuth:true}:{data:[{model:request.params.cursor?"two":"one",displayName:"图像模型"}],nextCursor:request.params.cursor?null:"next"};const bytes=Buffer.from(JSON.stringify({id:request.id,result})+"\n");for(const byte of bytes)child.stdout.write(Buffer.from([byte]));});child.kill=()=>{killed=true;child.emit("close",0);};return child;}});
  assert.equal(data.provider.name,"视觉供应方");assert.equal(data.models.length,2);assert.equal(data.models[0].name,"图像模型");assert.doesNotMatch(JSON.stringify(data),/hidden@example/);assert.equal(killed,true);assert.deepEqual(calls,["initialize","initialized","config/read","account/read","model/list","model/list"]);
});
test("An unavailable RPC process times out and is terminated without requesting a model turn",async()=>{
  let killed=false;await assert.rejects(inspectCodex({timeoutMs:15,spawnProcess:()=>{const child=processFixture(()=>{});child.kill=()=>{killed=true;child.emit("close",0);};return child;}}),/超时/);assert.equal(killed,true);
});
test("Closing a connection aborts its pending discovery process",async()=>{
  let killed=false;const connection=createCodexConnection({inspect:options=>inspectCodex({...options,spawnProcess:()=>{const child=processFixture(()=>{});child.kill=()=>{killed=true;child.emit("close",0);};return child;}})});
  const pending=connection.read();await connection.close();assert.equal((await pending).available,false);assert.equal(killed,true);await assert.rejects(connection.read(),/已关闭/);
});

test("A generation waiting on model discovery cannot start after the runtime closes",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"dh-discovery-close-")),workspace=initialize(folder,{example:true}).workspace;let release,runs=0;
  const gate=new Promise(resolve=>release=resolve),runtime=createLiveAgentRuntime(workspace,{connection:{select:async()=>{await gate;return {id:"test"};},record(){}},capture:async()=>null,run:async()=>{runs++;return {summary:"late",files:[],controls:[]};}});
  try{const pending=runtime.event({type:"message",role:"visual",id:"example",candidate:"comfortable",page:"task",prompt:"讨论",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision}).catch(error=>error);await runtime.close();release();assert.match((await pending).message,/已关闭/);assert.equal(runs,0);}finally{release();await runtime.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test("Cancelled refinement preserves its preview and reports cancellation instead of a Provider failure",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"dh-model-cancel-")),workspace=initialize(folder,{example:true}).workspace,connection=testConnection();let runs=0,started;
  const running=new Promise(resolve=>started=resolve),runtime=createLiveAgentRuntime(workspace,{connection,capture:async()=>null,run:async({directory,signal})=>{if(++runs===1){const spec=JSON.parse(fs.readFileSync(path.join(directory,"requirements/example/candidates/comfortable/pages/task.json")));spec.elements["task-page"].props.title="待确认修改";return {summary:"待确认",files:[{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec)}],controls:[]};}started();return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>setTimeout(()=>reject(new Error("cancelled")),10),{once:true}));}});
  try{const request={type:"message",role:"visual",id:"example",candidate:"comfortable",page:"task",prompt:"调整",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision},first=await runtime.event(request);while(["running","validating"].includes(runtime.get(first.id).state))await new Promise(resolve=>setTimeout(resolve,10));assert.equal(runtime.get(first.id).state,"ready");const second=await runtime.event({...request,baseJob:first.id});await running;const recovered=await runtime.event({type:"cancel",job:second.id});assert.equal(recovered.state,"ready");assert.equal((await runtime.connection()).lastRequest.state,"cancelled");}finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true});}
});


test("Conversation retains each actual model and restores the next-turn choice without changing identity",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"dh-model-history-")),workspace=initialize(folder,{example:true}).workspace,calls=[],runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),capture:async()=>null,run:async input=>{calls.push(input.model);return {summary:"继续讨论",files:[],controls:[]};}});
  try{const request={type:"message",role:"visual",id:"example",candidate:"comfortable",page:"task",prompt:"讨论层次",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision};for(const model of ["test-fast",""]){const started=await runtime.event({...request,model});while(runtime.get(started.id).state==="running")await new Promise(resolve=>setTimeout(resolve,5));assert.equal(runtime.get(started.id).state,"answered");}
    assert.deepEqual(calls.map(model=>model.id),["test-fast","test-vision"]);const session=runtime.session("example","comfortable");assert.equal(session.identity,"visual");assert.equal(session.model,"");assert.deepEqual(session.messages.filter(message=>message.role==="assistant").map(message=>message.model.id),["test-fast","test-vision"]);assert.equal((await runtime.connection()).lastRequest.state,"succeeded");
  }finally{await runtime.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test("Connection status requires the workbench token and never starts inference",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"dh-connection-api-")),workspace=initialize(folder,{example:true}).workspace;let modelCalls=0;
  const service=await startServer(workspace,{port:0,agentConnection:testConnection(),agentRun:async()=>{modelCalls++;throw new Error("must not run");}});
  try{assert.equal((await fetch(service.origin+"/__dh/live/connection")).status,403);const html=await fetch(service.origin).then(r=>r.text()),payload=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(html)[1]);const response=await fetch(service.origin+"/__dh/live/connection?refresh=1",{headers:{"X-DH-Token":payload.token}});assert.equal(response.status,200);const status=await response.json();assert.equal(status.auth,"authenticated");assert.equal(status.models.length,3);assert.equal(modelCalls,0);
  }finally{await service.close();fs.rmSync(folder,{recursive:true,force:true});}
});
