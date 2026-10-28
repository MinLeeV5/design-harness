import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {createAgentPreferences} from "../workbench/src/backend/adapters/agent-preferences.mjs";
import {createAgentSettings} from "../workbench/src/backend/services/agent-settings.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {testConnection} from "./helpers/codex-connection.mjs";
import {createCodexConnection} from "../workbench/src/backend/adapters/codex-connection.mjs";
import {testStatus} from "./helpers/codex-connection.mjs";

async function fixture(run){const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"dh-preferences-test-")),file=path.join(temporary,"preferences/agent.json"),store=createAgentPreferences({file});try{await run({temporary,file,store});}finally{fs.rmSync(temporary,{recursive:true,force:true});}}
test("Preferences default to interaction, save before any message and survive a new store without retaining design data",async()=>fixture(async({file,store})=>{
  assert.deepEqual(store.read(),{identity:"interaction",model:"",efforts:{},permissionMode:"proposal"});assert.equal(fs.existsSync(file),false);
  await store.patch({identity:"visual"});await store.patch({model:"test-vision",effort:{model:"test-vision",value:"high"}});await store.patch({effort:{model:"test-fast",value:"low"}});
  const restored=createAgentPreferences({file}).read();assert.equal(restored.identity,"visual");assert.equal(restored.model,"test-vision");assert.deepEqual(restored.efforts,{"test-vision":"high","test-fast":"low"});assert.equal(fs.statSync(file).mode&0o777,0o600);const disk=JSON.parse(fs.readFileSync(file));assert.deepEqual(Object.keys(disk).sort(),["efforts","identity","model","schemaVersion"]);assert.deepEqual(fs.readdirSync(path.dirname(file)),["agent.json"]);
  await assert.rejects(store.patch({token:"secret"}),/更新无效/);await assert.rejects(store.patch({effort:{model:"__proto__",value:"high"}}),/偏好无效/);assert.deepEqual(createAgentPreferences({file}).read(),restored);
}));
test("Existing sessions keep their settings while new sessions inherit the latest machine preferences",async()=>fixture(async({store,file})=>{
  const settings=createAgentSettings(store);assert.equal(settings.current("first").identity,"interaction");assert.equal(settings.current("existing").identity,"interaction");await settings.update("first",{identity:"visual",model:"test-fast"});assert.equal(settings.current("existing").identity,"interaction");assert.equal(settings.current("new").identity,"visual");await settings.update("existing",{identity:"interaction"});assert.equal(settings.current("first").identity,"visual");assert.equal(createAgentSettings(createAgentPreferences({file})).current("after restart").identity,"interaction");
}));
test("Concurrent workbench processes merge preferences without losing unrelated choices",async()=>fixture(async({file})=>{
  const module=new URL("../workbench/src/backend/adapters/agent-preferences.mjs",import.meta.url).href;
  const run=patch=>new Promise((resolve,reject)=>{const script=`import {createAgentPreferences} from ${JSON.stringify(module)};const store=createAgentPreferences({file:${JSON.stringify(file)}});for(let i=0;i<8;i++)await store.patch(${JSON.stringify(patch)});`;const child=spawn(process.execPath,["--input-type=module","-e",script],{stdio:["ignore","ignore","pipe"]});let error="";child.stderr.on("data",chunk=>error+=chunk);child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(error)));});
  await Promise.all([run({identity:"visual"}),run({model:"test-fast"}),run({effort:{model:"test-fast",value:"low"}})]);assert.deepEqual(createAgentPreferences({file}).read(),{identity:"visual",model:"test-fast",efforts:{"test-fast":"low"},permissionMode:"proposal"});
}));
test("Malformed settings fall back visibly, stale locks recover, and symlinks cannot overwrite unrelated files",async()=>fixture(async({temporary,file,store})=>{
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"broken");assert.match(store.read().warning,/默认设置/);fs.writeFileSync(file+".lock","");const past=new Date(Date.now()-40000);fs.utimesSync(file+".lock",past,past);await store.patch({identity:"visual"});assert.equal(store.read().identity,"visual");fs.unlinkSync(file);const target=path.join(temporary,"unrelated.txt");fs.writeFileSync(target,"untouched");fs.symlinkSync(target,file);await assert.rejects(store.patch({identity:"interaction"}),/软链接/);assert.equal(fs.readFileSync(target,"utf8"),"untouched");
}));
test("Depth selection is validated by the model and recorded independently of the automatic choice",async()=>{
  const connection=testConnection();try{const automatic=await connection.select("test-vision");assert.equal(automatic.effort,"high");assert.equal(automatic.effortChoice,"");const explicit=await connection.select("test-fast","low");assert.equal(explicit.effort,"low");assert.equal(explicit.effortChoice,"low");await assert.rejects(connection.select("test-fast","high"),/不支持.*深度/);}finally{await connection.close();}
  const withoutConfiguration=createCodexConnection({inspect:async()=>({...testStatus(),defaultEffort:""})});try{assert.equal((await withoutConfiguration.select("test-fast")).effort,"low");}finally{await withoutConfiguration.close();}
});
test("Settings API requires local authorization and keeps preferences outside project resources",async()=>fixture(async({temporary,store})=>{
  const project=path.join(temporary,"project");fs.mkdirSync(project);const workspace=initialize(project,{example:true}).workspace,service=await startServer(workspace,{port:0,agentConnection:testConnection(),agentPreferences:store});
  try{const html=await fetch(service.origin).then(r=>r.text()),payload=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(html)[1]),before=loadRequirement(workspace,"example").revision,request={id:"example",candidate:"comfortable",patch:{identity:"visual",effort:{model:"test-vision",value:"high"}}};assert.equal((await fetch(service.origin+"/__dh/live/settings",{method:"POST",body:JSON.stringify(request)})).status,403);const response=await fetch(service.origin+"/__dh/live/settings",{method:"POST",headers:{Origin:service.origin,"X-DH-Token":payload.token,"Content-Type":"application/json"},body:JSON.stringify(request)});assert.equal(response.status,200);assert.equal((await response.json()).identity,"visual");assert.equal(loadRequirement(workspace,"example").revision,before);assert.equal(fs.existsSync(path.join(workspace,"agent-preferences.json")),false);
  }finally{await service.close();}
}));
test("Runtime history preserves the actual depth and restores each candidate selection",async()=>fixture(async({temporary,store})=>{
  const project=path.join(temporary,"project");fs.mkdirSync(project);const workspace=initialize(project,{example:true}).workspace,calls=[],runtime=createLiveAgentRuntime(workspace,{preferences:store,connection:testConnection(),capture:async()=>null,run:async input=>{calls.push(input.model);return {summary:"继续讨论",files:[],controls:[]};}});
  try{await runtime.saveSettings("example","comfortable",{identity:"visual",model:"test-vision",effort:{model:"test-vision",value:"high"}});const request={type:"message",role:"visual",model:"test-vision",effort:"high",id:"example",candidate:"comfortable",page:"task",prompt:"讨论阅读层次",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision},job=await runtime.event(request);while(runtime.get(job.id).state==="running")await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls[0].effort,"high");assert.equal(runtime.session("example","comfortable").messages.at(-1).model.effort,"high");assert.equal(runtime.session("example","comfortable").efforts["test-vision"],"high");}finally{await runtime.close();}
}));
test("A full preference history and a recoverable preference read failure do not strand generation",async()=>fixture(async({temporary,store})=>{
  for(let i=0;i<128;i++)await store.patch({effort:{model:"old-"+i,value:"low"}});
  await store.patch({effort:{model:"test-fast",value:"low"}});assert.equal(Object.keys(store.read().efforts).length,128);assert.equal(Object.hasOwn(store.read().efforts,"old-0"),false);
  const project=path.join(temporary,"project");fs.mkdirSync(project);const workspace=initialize(project,{example:true}).workspace;let fail=true,calls=0;
  const runtime=createLiveAgentRuntime(workspace,{preferences:{read(){if(fail){fail=false;throw new Error("temporary preference failure");}return store.read();},patch:store.patch},connection:testConnection(),capture:async()=>null,run:async()=>{calls++;return {summary:"继续讨论",files:[],controls:[]};}});
  try{const request={type:"message",role:"interaction",model:"test-vision",effort:"high",id:"example",candidate:"comfortable",page:"task",prompt:"继续讨论",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision};await assert.rejects(runtime.event(request),/temporary preference failure/);assert.equal(calls,0);const job=await runtime.event(request);while(runtime.get(job.id).state==="running")await new Promise(resolve=>setTimeout(resolve,5));assert.equal(runtime.get(job.id).state,"answered");assert.equal(calls,1);assert.equal(runtime.session("example","comfortable").efforts["test-vision"],"high");assert.equal(Object.keys(runtime.session("example","comfortable").efforts).length,128);}finally{await runtime.close();}
}));
