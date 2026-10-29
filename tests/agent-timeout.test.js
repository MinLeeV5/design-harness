import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initialize} from '../workbench/src/backend/services/workspace.mjs';
import {loadRequirement} from '../workbench/src/backend/adapters/resource-store.mjs';
import {createLiveAgentRuntime} from '../workbench/src/backend/services/agent-runtime.mjs';
import {testConnection,memoryPreferences} from './helpers/codex-connection.mjs';

const minute=60000;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await flush();}throw new Error('missing runtime transition');}
const aborted=signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('native turn interrupted')),{once:true}));
async function fixture(t,run,check){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-idle-test-')),workspace=initialize(base,{example:true}).workspace;
  const runtime=createLiveAgentRuntime(workspace,{run,connection:testConnection(),preferences:memoryPreferences(),capture:async()=>null});
  const request=sessionId=>({type:'message',sessionId,role:'visual',id:'example',candidate:'comfortable',page:'task',capture:{page:'task',state:{}},expectedRevision:loadRequirement(workspace,'example').revision,prompt:'检查设计'});
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
  const advance=async ms=>{t.mock.timers.tick(ms);await flush();};
  const start=async()=>{const session=runtime.createSession('example','comfortable');return runtime.event(request(session.id));};
  try{await check({runtime,workspace,request,advance,start});}
  finally{await runtime.close();t.mock.timers.reset();fs.rmSync(base,{recursive:true,force:true});}
}

test('Changed activity and native output keep a turn alive beyond ten minutes total',async t=>{
  let input,finish;
  await fixture(t,value=>{input=value;return new Promise((resolve,reject)=>{finish=resolve;value.signal.addEventListener('abort',()=>reject(new Error('interrupted')),{once:true});});},async({runtime,advance,start})=>{
    const job=await start();await until(()=>input);
    await advance(9*minute);input.onEvent({id:'command',label:'执行命令',status:'running',output:'第一段输出'});
    await advance(9*minute);assert.equal(input.signal.aborted,false);
    input.onProgress(); // Native final-answer/reasoning deltas need not appear in public activity.
    await advance(9*minute);assert.equal(input.signal.aborted,false);
    finish({summary:'完成',files:[]});await until(()=>runtime.get(job.id,job.sessionId).state==='answered');
    assert.equal(runtime.get(job.id,job.sessionId).messages.at(-1).completedAt-job.startedAt,27*minute);
  });
});

test('Repeated activity, unchanged usage and snapshot reads do not extend idle time',async t=>{
  let input;
  await fixture(t,value=>{input=value;return aborted(value.signal);},async({runtime,advance,start})=>{
    const job=await start();await until(()=>input);
    const event={id:'command',label:'执行命令',status:'running',output:'没有后续输出'};
    const usage={total:{inputTokens:10,outputTokens:5,totalTokens:15},updatedAt:Date.now()};
    input.onEvent(event);input.onObservation({kind:'usage',usage});
    await advance(9*minute);input.onEvent({...event});input.onObservation({kind:'usage',usage:{...usage,updatedAt:Date.now()}});
    runtime.session('example','comfortable',job.sessionId);runtime.get(job.id,job.sessionId);
    await advance(minute);await until(()=>runtime.get(job.id,job.sessionId).state==='failed');
    assert.equal(input.signal.reason,'timeout');assert.match(runtime.get(job.id,job.sessionId).error,/无进展/);
  });
});

test('Usage growth and a new compaction refresh idle time, while duplicate compactions do not',async t=>{
  let input;
  await fixture(t,value=>{input=value;return aborted(value.signal);},async({runtime,advance,start})=>{
    const job=await start();await until(()=>input);
    input.onObservation({kind:'usage',usage:{total:{inputTokens:10,outputTokens:1,totalTokens:11}}});
    await advance(9*minute);input.onObservation({kind:'usage',usage:{total:{inputTokens:10,outputTokens:2,totalTokens:12}}});
    await advance(9*minute);assert.equal(input.signal.aborted,false);
    input.onObservation({kind:'compaction',id:'compaction',at:Date.now()});
    await advance(9*minute);assert.equal(input.signal.aborted,false);
    input.onObservation({kind:'compaction',id:'compaction',at:Date.now()});
    await advance(minute);await until(()=>runtime.get(job.id,job.sessionId).state==='failed');
    assert.equal(input.signal.reason,'timeout');
  });
});

test('All pending approvals wait indefinitely and the last decision starts a fresh idle interval',async t=>{
  let input;
  await fixture(t,value=>{input=value;return aborted(value.signal);},async({runtime,advance,start})=>{
    const job=await start();await until(()=>input);
    await advance(9*minute);
    const first=input.onApproval({kind:'command',title:'执行命令需要批准',choices:['accept','decline','cancel']});
    const second=input.onApproval({kind:'mcp',title:'工具需要确认',choices:['accept','decline','cancel']});
    await advance(24*60*minute);
    assert.equal(input.signal.aborted,false);assert.equal(runtime.sessions('example','comfortable').find(s=>s.id===job.sessionId).state,'awaiting_approval');
    const decide=(index,decision)=>runtime.event({type:'approval',sessionId:job.sessionId,job:job.id,approvalId:runtime.get(job.id,job.sessionId).approvals[index].id,decision});
    await decide(0,'accept');assert.equal((await first).decision,'accept');
    input.onEvent({id:'other-progress',label:'其他工具进展',status:'done'});
    await advance(24*60*minute);assert.equal(input.signal.aborted,false);
    await decide(1,'decline');assert.equal((await second).decision,'decline');
    await advance(9*minute);assert.equal(input.signal.aborted,false);
    await advance(minute);await until(()=>runtime.get(job.id,job.sessionId).state==='failed');
    assert.deepEqual(runtime.get(job.id,job.sessionId).approvals.map(a=>a.state),['accepted','declined']);
  });
});

test('Waiting approvals can still be explicitly cancelled and cannot be approved late',async t=>{
  let input;
  await fixture(t,async value=>{input=value;const answer=await value.onApproval({kind:'file',title:'修改文件需要批准',choices:['accept','cancel']});return {summary:answer.decision,files:[]};},async({runtime,advance,start})=>{
    const job=await start();await until(()=>runtime.get(job.id,job.sessionId).approvals.length);
    await advance(24*60*minute);assert.equal(input.signal.aborted,false);
    const approvalId=runtime.get(job.id,job.sessionId).approvals[0].id;
    const cancelled=await runtime.event({type:'cancel',sessionId:job.sessionId,job:job.id});
    assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.approvals[0].state,'cancelled');
    assert.equal(fs.existsSync(input.directory),false);
    await assert.rejects(runtime.event({type:'approval',sessionId:job.sessionId,job:job.id,approvalId,decision:'accept'}),/审批已结束/);
  });
});

test('Native approval withdrawal resumes a full idle interval without a user decision',async t=>{
  let input;
  await fixture(t,value=>{input=value;return aborted(value.signal);},async({runtime,advance,start})=>{
    const job=await start();await until(()=>input);
    await advance(9*minute);const controller=new AbortController();
    const approval=input.onApproval({kind:'command',title:'即将撤销的请求',choices:['accept','cancel']},{signal:controller.signal});
    await advance(24*60*minute);assert.equal(input.signal.aborted,false);
    controller.abort();assert.deepEqual(await approval,{decision:'cancel'});
    await advance(9*minute);assert.equal(input.signal.aborted,false);
    await advance(minute);await until(()=>runtime.get(job.id,job.sessionId).state==='failed');
  });
});

test('Idle interruption keeps files and the session slot until native execution has stopped',async t=>{
  let input,stop;
  const stopped=new Promise(resolve=>stop=resolve);
  await fixture(t,async value=>{input=value;try{await aborted(value.signal);}catch{await stopped;throw new Error('native cleanup finished');}},async({runtime,advance,start,request})=>{
    try{
      const job=await start();await until(()=>input);
      await advance(10*minute);assert.equal(input.signal.reason,'timeout');
      assert.equal(fs.existsSync(input.directory),true,'active commands must retain their working directory');
      await assert.rejects(runtime.event(request(job.sessionId)),/待处理/);
      assert.deepEqual(await input.onApproval({kind:'command',title:'迟到审批',choices:['accept','cancel']}),{decision:'cancel'});
      stop();await until(()=>runtime.get(job.id,job.sessionId).state==='failed');
      assert.equal(fs.existsSync(input.directory),false);
      assert.match(runtime.get(job.id,job.sessionId).error,/无进展/);
    }finally{stop();}
  });
});

test('Progress in one session never extends another session idle interval',async t=>{
  const inputs=new Map();
  await fixture(t,value=>{inputs.set(value.sessionId,value);return aborted(value.signal);},async({runtime,advance,start})=>{
    const a=await start(),b=await start();await until(()=>inputs.size===2);
    await advance(9*minute);inputs.get(a.sessionId).onEvent({id:'progress',label:'会话甲进展',status:'done'});
    await advance(minute);await until(()=>runtime.get(b.id,b.sessionId).state==='failed');
    assert.equal(inputs.get(a.sessionId).signal.aborted,false);
    await advance(9*minute);await until(()=>runtime.get(a.id,a.sessionId).state==='failed');
  });
});

test('Explicit cancellation retains the session slot while the native turn is stopping',async t=>{
  let input,stop;const stopped=new Promise(resolve=>stop=resolve);
  await fixture(t,async value=>{input=value;try{await aborted(value.signal);}catch{await stopped;throw new Error('native turn stopped');}},async({runtime,start,request})=>{
    try{
      const job=await start();await until(()=>input);
      const cancelled=runtime.event({type:'cancel',sessionId:job.sessionId,job:job.id});
      assert.equal(fs.existsSync(input.directory),true);
      await assert.rejects(runtime.event(request(job.sessionId)),/待处理/);
      await assert.rejects(runtime.saveSettings('example','comfortable',{model:'test-fast'},job.sessionId),/正在处理/);
      stop();assert.equal((await cancelled).state,'cancelled');assert.equal(fs.existsSync(input.directory),false);
    }finally{stop();}
  });
});
