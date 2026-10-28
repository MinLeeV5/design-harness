import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initialize} from '../workbench/src/backend/services/workspace.mjs';
import {loadRequirement} from '../workbench/src/backend/adapters/resource-store.mjs';
import {createLiveAgentRuntime} from '../workbench/src/backend/services/agent-runtime.mjs';
import {testConnection,memoryPreferences} from './helpers/codex-connection.mjs';
async function fixture(run,check){const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-sessions-')),workspace=initialize(base,{example:true}).workspace,runtime=createLiveAgentRuntime(workspace,{run,connection:testConnection(),preferences:memoryPreferences(),capture:async()=>null});try{await check({runtime,workspace});}finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}}
const request=(workspace,sessionId,prompt='讨论')=>({type:'message',sessionId,role:'visual',id:'example',candidate:'comfortable',page:'task',capture:{page:'task',state:{}},expectedRevision:loadRequirement(workspace,'example').revision,prompt});
async function until(check){const deadline=Date.now()+30000;while(!check()){if(Date.now()>deadline)throw new Error('session did not settle');await new Promise(r=>setTimeout(r,10));}}
const done=async(runtime,job)=>{await until(()=>!['running','validating'].includes(runtime.get(job.id,job.sessionId).state));return runtime.get(job.id,job.sessionId);};
test('Same candidate sessions run concurrently, reserve one turn each, isolate settings, outcomes, history and cancellation',async()=>{
 const turns=new Map();await fixture(input=>new Promise((resolve,reject)=>{turns.set(input.sessionId,{...input,resolve});input.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});}),async({runtime,workspace})=>{
  const a=runtime.createSession('example','comfortable'),b=runtime.createSession('example','comfortable');
  await runtime.saveSettings('example','comfortable',{model:'test-fast'},a.id);assert.equal(runtime.session('example','comfortable',b.id).model,'');
  const pending=runtime.event(request(workspace,a.id,'甲问题'));await assert.rejects(runtime.event(request(workspace,a.id,'重复提交')),/正在提交/);const first=await pending,second=await runtime.event(request(workspace,b.id,'乙问题'));await until(()=>turns.size===2);
  await assert.rejects(runtime.event(request(workspace,a.id)),/待处理/);assert.throws(()=>runtime.get(first.id,b.id),/不属于/);await assert.rejects(runtime.event({type:'cancel',job:first.id,sessionId:b.id}),/不属于/);assert.throws(()=>runtime.session('example','compact',a.id),/不属于/);
  await runtime.event({type:'cancel',job:first.id,sessionId:a.id});assert.equal(turns.get(b.id).signal.aborted,false);turns.get(b.id).resolve({summary:'乙回答',files:[],controls:[]});assert.equal((await done(runtime,second)).state,'answered');
  assert.deepEqual(runtime.session('example','comfortable',a.id).messages.map(m=>m.content),['甲问题','已取消本轮请求']);assert.deepEqual(runtime.session('example','comfortable',b.id).messages.map(m=>m.content),['乙问题','乙回答']);assert.equal((await runtime.connection({sessionId:a.id})).lastRequest.state,'cancelled');assert.equal((await runtime.connection({sessionId:b.id})).lastRequest.state,'succeeded');
  const native=turns.get(b.id).session,next=await runtime.event(request(workspace,b.id,'乙下一轮'));await until(()=>turns.get(b.id).prompt.includes('乙下一轮'));assert.equal(turns.get(b.id).session,native);assert.doesNotMatch(turns.get(b.id).prompt,/乙问题|甲问题/);turns.get(b.id).resolve({summary:'乙继续',files:[],controls:[]});await done(runtime,next);
 });
});
test('Concurrent proposals keep separate staged files; accepting one rejects stale acceptance and preserves the other preview',async()=>{
 const calls=[];await fixture(async input=>{calls.push(input);const spec=JSON.parse(fs.readFileSync(path.join(input.directory,'requirements/example/candidates/comfortable/pages/task.json')));spec.elements['task-page'].props.title=input.sessionId;return {summary:input.sessionId,files:[{path:'candidates/comfortable/pages/task.json',content:JSON.stringify(spec)}],controls:[]};},async({runtime,workspace})=>{
  const a=runtime.createSession('example','comfortable'),b=runtime.createSession('example','comfortable'),file=path.join(workspace,'requirements/example/candidates/comfortable/pages/task.json'),before=fs.readFileSync(file);
  const jobs=await Promise.all([runtime.event(request(workspace,a.id)),runtime.event(request(workspace,b.id))]),[first,second]=await Promise.all(jobs.map(job=>done(runtime,job)));assert.equal(first.state,'ready',first.error);assert.equal(second.state,'ready',second.error);assert.notEqual(calls[0].directory,calls[1].directory);assert.deepEqual(fs.readFileSync(file),before);
  await assert.rejects(runtime.event({...request(workspace,a.id),baseJob:second.id}),/只能继续/);
  await runtime.event({type:'accept',job:first.id,sessionId:a.id});assert.equal(JSON.parse(fs.readFileSync(file)).elements['task-page'].props.title,a.id);await assert.rejects(runtime.event({type:'accept',job:second.id,sessionId:b.id}),/源资源已被修改/);assert.equal(runtime.get(second.id,b.id).state,'ready');assert.equal(runtime.get(second.id,b.id).proposal.spec.elements['task-page'].props.title,b.id);
  await runtime.event({type:'discard',job:second.id,sessionId:b.id});const next=await done(runtime,await runtime.event(request(workspace,b.id,'基于实际资源重试')));assert.equal(next.state,'ready',next.error);assert.match(calls.at(-1).prompt,/"previousProposal":"discarded"/);assert.ok(calls.at(-1).prompt.includes(a.id));assert.equal(calls.at(-1).session,calls[1].session);
 });
});

test('Cancelling during native thread creation records the terminal outcome without starting inference',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-thread-create-')),workspace=initialize(base,{example:true}).workspace,connection=testConnection();let release,started=false,runs=0;const gate=new Promise(r=>release=r);
 const provider={id:'codex',capabilities:{},inspect:options=>connection.read(options),selectModel:(...args)=>connection.select(...args),record:(...args)=>connection.record(...args),createSession:async()=>{started=true;await gate;return {};},runTurn:async()=>{runs++;return {summary:'unexpected',files:[]};},dispose:()=>connection.close()};
 const runtime=createLiveAgentRuntime(workspace,{provider,preferences:memoryPreferences(),capture:async()=>null});try{const session=runtime.createSession('example','comfortable'),job=await runtime.event(request(workspace,session.id));await until(()=>started);const cancel=runtime.event({type:'cancel',job:job.id,sessionId:session.id});release();await cancel;assert.equal(runs,0);assert.equal((await runtime.connection({sessionId:session.id})).lastRequest.state,'cancelled');}finally{release();await runtime.close();fs.rmSync(base,{recursive:true,force:true});}
});
