import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createCodexProvider} from '../workbench/src/backend/adapters/codex-app-server.mjs';
import {testConnection} from './helpers/codex-connection.mjs';

function harness({early=false,deferStarts=false,cancelTimeoutMs=5000,rpcTimeoutMs=30000}={}){
 const child=new EventEmitter(),requests=[];let spawned=0,threads=0,turns=0,buffer='';
 child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',0));
 const send=message=>{const bytes=Buffer.from(JSON.stringify(message)+'\n');for(let i=0;i<bytes.length;i+=3)child.stdout.write(bytes.subarray(i,i+3));};
 const notify=(method,params)=>send({method,params}),reply=(id,result)=>send({id,result});
 const complete=(threadId,turnId,summary,status='completed')=>{notify('item/completed',{threadId,turnId,item:{id:'final',type:'agentMessage',phase:'final_answer',text:JSON.stringify({summary,files:[],controls:[]})}});notify('turn/completed',{threadId,turn:{id:turnId,status,error:status==='failed'?{message:'visible failure'}:null}});};
 child.stdin.on('data',bytes=>{buffer+=bytes.toString();let end;while((end=buffer.indexOf('\n'))>=0){const request=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);requests.push(request);if(request.method==='initialize')reply(request.id,{});if(request.method==='thread/start')reply(request.id,{thread:{id:'thread-'+(++threads)}});if(request.method==='turn/start'){const id='turn-'+(++turns);if(early)complete(request.params.threadId,id,'提前结果');if(!deferStarts)reply(request.id,{turn:{id,status:'inProgress'}});}if(request.method==='turn/interrupt'){reply(request.id,{});notify('turn/completed',{threadId:request.params.threadId,turn:{id:request.params.turnId,status:'interrupted'}});}if(request.method==='thread/unsubscribe')reply(request.id,{});}});
 const provider=createCodexProvider({connection:testConnection(),cancelTimeoutMs,rpcTimeoutMs,spawnProcess:(command,args)=>{spawned++;assert.equal(command,'codex');assert.equal(args[0],'app-server');return child;}});
 const input={directory:'/tmp/design-proposal',model:{id:'vision',effort:'high'},schema:{type:'object'},prompt:'当前问题',imageFiles:['/tmp/current.png'],signal:new AbortController().signal};
 return {provider,child,requests,send,notify,complete,input,spawned:()=>spawned};
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw new Error('missing protocol event');}
test('Native threads multiplex out-of-order turns, preserve history handles and use per-turn model/schema/images',async()=>{
 const h=harness(),eventsA=[],eventsB=[];try{
  const [a,b]=await Promise.all([h.provider.createSession(h.input),h.provider.createSession(h.input)]);assert.notEqual(a.threadId,b.threadId);assert.equal(h.spawned(),1);
  const first=h.provider.runTurn({...h.input,session:a,onEvent:e=>eventsA.push(e)}),second=h.provider.runTurn({...h.input,session:b,onEvent:e=>eventsB.push(e)});await until(()=>h.requests.filter(r=>r.method==='turn/start').length===2);
  h.notify('item/completed',{threadId:a.threadId,turnId:'turn-1',item:{type:'reasoning',id:'secret',text:'hidden reasoning'}});
  h.notify('item/completed',{threadId:b.threadId,turnId:'turn-2',item:{type:'agentMessage',phase:'commentary',id:'note',text:'乙会话进展'}});
  h.complete(b.threadId,'turn-2','乙结果');assert.equal((await second).summary,'乙结果');assert.ok(eventsB.some(e=>e.text==='乙会话进展'));assert.equal(eventsA.some(e=>e.text),false);
  h.complete(a.threadId,'turn-1','甲结果');assert.equal((await first).summary,'甲结果');assert.doesNotMatch(JSON.stringify([...eventsA,...eventsB]),/hidden reasoning|files|controls|甲结果|乙结果/);
  const next=h.provider.runTurn({...h.input,session:a,model:{id:'other',effort:'low'},schema:{type:'string'}});await until(()=>h.requests.filter(r=>r.method==='turn/start').length===3);
  h.complete(a.threadId,'turn-1','stale result');h.complete(a.threadId,'turn-3','继续甲');assert.equal((await next).summary,'继续甲');
  const starts=h.requests.filter(r=>r.method==='thread/start');assert.ok(starts.every(r=>r.params.ephemeral&&r.params.sandbox==='read-only'&&r.params.approvalPolicy==='never'));
  const params=h.requests.filter(r=>r.method==='turn/start').at(-1).params;assert.equal(params.threadId,a.threadId);assert.equal(params.model,'other');assert.equal(params.effort,'low');assert.deepEqual(params.outputSchema,{type:'string'});assert.deepEqual(params.input,[{type:'text',text:'当前问题'},{type:'localImage',path:'/tmp/current.png'}]);assert.equal(params.sandboxPolicy.type,'readOnly');
 }finally{await h.provider.dispose();}
});
test('Notifications arriving before turn/start response still produce the structured result',async()=>{
 const h=harness({early:true});try{const session=await h.provider.createSession(h.input);assert.equal((await h.provider.runTurn({...h.input,session})).summary,'提前结果');}finally{await h.provider.dispose();}
});
test('Cancellation interrupts only its native turn; process exit fails all active turns and invalidates handles',async()=>{
 const h=harness();try{
  const [a,b]=await Promise.all([h.provider.createSession(h.input),h.provider.createSession(h.input)]),controller=new AbortController();
  const first=h.provider.runTurn({...h.input,session:a,signal:controller.signal}),second=h.provider.runTurn({...h.input,session:b});await until(()=>h.requests.filter(r=>r.method==='turn/start').length===2);
  await assert.rejects(h.provider.runTurn({...h.input,session:a}),/上一轮/);controller.abort();await assert.rejects(first,/取消/);
  assert.deepEqual(h.requests.filter(r=>r.method==='turn/interrupt').map(r=>r.params),[{threadId:a.threadId,turnId:'turn-1'}]);h.complete(b.threadId,'turn-2','unaffected');assert.equal((await second).summary,'unaffected');
  const again=h.provider.runTurn({...h.input,session:a}),other=h.provider.runTurn({...h.input,session:b});const checks=[assert.rejects(again,/断开/),assert.rejects(other,/断开/)];h.child.emit('close',1);await Promise.all(checks);await assert.rejects(h.provider.runTurn({...h.input,session:a}),/失效/);
 }finally{await h.provider.dispose();}
});

test('Cancellation before a delayed turn/start reply still interrupts that exact turn after the grace period',async()=>{
 const h=harness({deferStarts:true,cancelTimeoutMs:10});try{const session=await h.provider.createSession(h.input),controller=new AbortController(),pending=h.provider.runTurn({...h.input,session,signal:controller.signal});const rejected=assert.rejects(pending,/取消响应超时/);controller.abort();await rejected;const start=h.requests.find(r=>r.method==='turn/start');h.send({id:start.id,result:{turn:{id:'late-turn',status:'inProgress'}}});await until(()=>h.requests.some(r=>r.method==='turn/interrupt'));assert.deepEqual(h.requests.find(r=>r.method==='turn/interrupt').params,{threadId:session.threadId,turnId:'late-turn'});}finally{await h.provider.dispose();}
});

test('A turn/start response arriving after RPC timeout is retained only to interrupt the abandoned native turn',async()=>{
 const h=harness({deferStarts:true,cancelTimeoutMs:5,rpcTimeoutMs:10});try{const session=await h.provider.createSession(h.input),controller=new AbortController(),pending=h.provider.runTurn({...h.input,session,signal:controller.signal});const rejected=assert.rejects(pending,/取消响应超时/);controller.abort();await rejected;await new Promise(r=>setTimeout(r,20));const start=h.requests.find(r=>r.method==='turn/start');h.send({id:start.id,result:{turn:{id:'after-rpc-timeout',status:'inProgress'}}});await until(()=>h.requests.some(r=>r.method==='turn/interrupt'));assert.deepEqual(h.requests.find(r=>r.method==='turn/interrupt').params,{threadId:session.threadId,turnId:'after-rpc-timeout'});}finally{await h.provider.dispose();}
});
