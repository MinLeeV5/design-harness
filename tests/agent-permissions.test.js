import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initialize} from '../workbench/src/backend/services/workspace.mjs';
import {createLiveAgentRuntime} from '../workbench/src/backend/services/agent-runtime.mjs';
import {loadRequirement} from '../workbench/src/backend/adapters/resource-store.mjs';
import {testConnection,memoryPreferences} from './helpers/codex-connection.mjs';

const relative='requirements/example/candidates/comfortable/pages/task.json';
async function fixture(run,check){const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-permissions-test-')),workspace=initialize(base,{example:true}).workspace,preferences=memoryPreferences(),runtime=createLiveAgentRuntime(workspace,{run,preferences,connection:testConnection(),capture:async()=>null});try{await check({base,workspace,preferences,runtime});}finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}}
const request=(workspace,sessionId,extra={})=>({type:'message',sessionId,role:'visual',id:'example',candidate:'comfortable',page:'task',capture:{page:'task',state:{}},expectedRevision:loadRequirement(workspace,'example').revision,prompt:'检查设计',...extra});
async function until(check){const end=Date.now()+30000;while(!check()){if(Date.now()>end)throw new Error('permission test timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
async function done(runtime,job){await until(()=>!['running','validating'].includes(runtime.get(job.id,job.sessionId).state));return runtime.get(job.id,job.sessionId);}

test('Permission selection is session-local, validates input and records the actual mode on both messages',async()=>{
 const calls=[];await fixture(async input=>{calls.push(input);return {summary:'只读讨论',files:[]};},async({runtime,workspace,preferences})=>{
  const a=runtime.createSession('example','comfortable');assert.equal(a.permissionMode,'proposal');await runtime.saveSettings('example','comfortable',{permissionMode:'full-access'},a.id);
  const b=runtime.createSession('example','comfortable');assert.equal(b.permissionMode,'proposal');assert.equal(preferences.read().permissionMode,'proposal');
  await assert.rejects(runtime.saveSettings('example','comfortable',{permissionMode:'unknown'},a.id),/权限模式无效/);
  const first=await done(runtime,await runtime.event(request(workspace,a.id)));assert.equal(calls[0].permissionMode,'full-access');assert.ok(first.messages.every(message=>message.permissionMode==='full-access'));assert.match(calls[0].prompt,/Authoritative original requirement directory/);
  await runtime.saveSettings('example','comfortable',{permissionMode:'read-only'},a.id);const next=await done(runtime,await runtime.event(request(workspace,a.id)));assert.equal(calls[1].permissionMode,'read-only');assert.equal(calls[1].session,calls[0].session);assert.equal(next.messages.at(-1).permissionMode,'read-only');assert.equal(next.messages[0].permissionMode,'full-access');
 });
});

test('Actual command edits in a proposal copy are validated and remain staged until accepted',async()=>{
 await fixture(async input=>{const file=path.join(input.directory,relative),spec=JSON.parse(fs.readFileSync(file));spec.elements['task-page'].props.title='工具直接修改';fs.writeFileSync(file,JSON.stringify(spec));return {summary:'已经修改副本',files:[],controls:[]};},async({runtime,workspace})=>{
  const session=runtime.createSession('example','comfortable'),file=path.join(workspace,relative),before=fs.readFileSync(file),job=await done(runtime,await runtime.event(request(workspace,session.id)));
  assert.equal(job.state,'ready',job.error);assert.equal(job.proposal.changes.length,1);assert.deepEqual(fs.readFileSync(file),before);await runtime.event({type:'accept',sessionId:session.id,job:job.id});assert.equal(JSON.parse(fs.readFileSync(file)).elements['task-page'].props.title,'工具直接修改');
 });
});

test('Unreported file edits, deletes, symlinks and shared foundation changes cannot bypass the proposal policy',async()=>{
 for(const operation of ['foundation','delete','symlink','binary','readonly'])await fixture(async input=>{
  if(operation==='foundation')fs.appendFileSync(path.join(input.directory,'foundation/tokens.css'),'\n/* external */');
  if(operation==='delete')fs.unlinkSync(path.join(input.directory,relative));
  if(operation==='symlink')fs.symlinkSync('/tmp',path.join(input.directory,'escape'));
  if(operation==='binary')fs.writeFileSync(path.join(input.directory,'requirements/example/unreported.bin'),'x');
  if(operation==='readonly')fs.appendFileSync(path.join(input.directory,relative),'\n');
  return {summary:'完成',files:[]};
 },async({runtime,workspace})=>{
  const session=runtime.createSession('example','comfortable'),file=path.join(workspace,relative),before=fs.readFileSync(file),job=await done(runtime,await runtime.event(request(workspace,session.id,{permissionMode:operation==='readonly'?'read-only':'proposal'})));
  assert.equal(job.state,'failed',operation);assert.match(job.error,/范围|删除|软链接|只读/);assert.deepEqual(fs.readFileSync(file),before);
 });
});

test('Pending approvals survive snapshots, cannot be answered across sessions, and expire after cancellation',async()=>{
 const calls=[];await fixture(async input=>{calls.push(input);const answer=await input.onApproval({kind:'command',title:'执行命令需要批准',command:'node --version',choices:['accept','decline','cancel']});return {summary:'审批结果 '+answer.decision,files:[]};},async({runtime,workspace})=>{
  const a=runtime.createSession('example','comfortable'),b=runtime.createSession('example','comfortable'),job=await runtime.event(request(workspace,a.id));await until(()=>runtime.get(job.id,a.id).approvals.length===1);
  const approval=runtime.session('example','comfortable',a.id).job.approvals[0];assert.equal(approval.state,'pending');assert.equal(runtime.sessions('example','comfortable').find(session=>session.id===a.id).state,'awaiting_approval');
  await assert.rejects(runtime.event({type:'approval',job:job.id,sessionId:b.id,approvalId:approval.id,decision:'accept'}),/不属于/);
  await runtime.event({type:'approval',job:job.id,sessionId:a.id,approvalId:approval.id,decision:'accept'});const completed=await done(runtime,job);assert.equal(completed.summary,'审批结果 accept');assert.equal(completed.messages.at(-1).approvals[0].state,'accepted');
  await assert.rejects(runtime.event({type:'approval',job:job.id,sessionId:a.id,approvalId:approval.id,decision:'accept'}),/审批已结束/);
  const cancelled=await runtime.event(request(workspace,b.id));await until(()=>runtime.get(cancelled.id,b.id).approvals.length===1);await runtime.event({type:'cancel',job:cancelled.id,sessionId:b.id});assert.equal(runtime.get(cancelled.id,b.id).approvals[0].state,'cancelled');
 });
});

test('Full access detects source changes, and cancelling or discarding never rolls them back',async()=>{
 let source,changed=false;await fixture(input=>new Promise((resolve,reject)=>{fs.appendFileSync(source,'\n');changed=true;input.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});}),async({runtime,workspace})=>{
  source=path.join(workspace,relative);const session=runtime.createSession('example','comfortable'),before=fs.readFileSync(source,'utf8');await runtime.saveSettings('example','comfortable',{permissionMode:'full-access'},session.id);
  const job=await runtime.event(request(workspace,session.id));await until(()=>changed);await runtime.event({type:'cancel',job:job.id,sessionId:session.id});assert.equal(fs.readFileSync(source,'utf8'),before+'\n');assert.equal(runtime.get(job.id,session.id).sourceChanged,true);
 });
});

test('A late write to the retired execution directory cannot change an already validated proposal',async()=>{
 let execution,lateWrite;try{await fixture(async input=>{
  execution=path.dirname(input.directory);const file=path.join(input.directory,relative),spec=JSON.parse(fs.readFileSync(file));spec.elements['task-page'].props.title='已评审副本';fs.writeFileSync(file,JSON.stringify(spec));
  lateWrite=()=>{fs.mkdirSync(path.dirname(file),{recursive:true});spec.elements['task-page'].props.title='迟到后台写入';fs.writeFileSync(file,JSON.stringify(spec));};return {summary:'副本已冻结',files:[]};
 },async({runtime,workspace})=>{
  const session=runtime.createSession('example','comfortable'),job=await done(runtime,await runtime.event(request(workspace,session.id)));assert.equal(job.state,'ready',job.error);lateWrite();assert.equal(job.proposal.spec.elements['task-page'].props.title,'已评审副本');await runtime.event({type:'accept',job:job.id,sessionId:session.id});assert.equal(JSON.parse(fs.readFileSync(path.join(workspace,relative))).elements['task-page'].props.title,'已评审副本');
 });}finally{if(execution)fs.rmSync(execution,{recursive:true,force:true});}
});

test('Tool confirmation validates required inputs and sends content only to its pending request',async()=>{
 await fixture(async input=>{const answer=await input.onApproval({kind:'mcp',title:'工具需要确认',fields:[{id:'purpose',label:'访问用途',type:'string',required:true,minLength:2}],choices:['accept','decline','cancel']});return {summary:answer.content.purpose,files:[]};},async({runtime,workspace})=>{
  const session=runtime.createSession('example','comfortable'),job=await runtime.event(request(workspace,session.id));await until(()=>runtime.get(job.id,session.id).approvals.length===1);const approvalId=runtime.get(job.id,session.id).approvals[0].id,event={type:'approval',job:job.id,sessionId:session.id,approvalId,decision:'accept'};
  await assert.rejects(runtime.event(event),/请填写/);assert.equal(runtime.get(job.id,session.id).approvals[0].state,'pending');await assert.rejects(runtime.event({...event,content:{purpose:123}}),/格式无效/);await runtime.event({...event,content:{purpose:'核对设计'}});assert.equal((await done(runtime,job)).summary,'核对设计');
 });
});
