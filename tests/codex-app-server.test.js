import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createCodexProvider} from '../workbench/src/backend/adapters/codex-app-server.mjs';
import {testConnection} from './helpers/codex-connection.mjs';

function harness({early=false,deferStarts=false,deferCleanup=false,cancelTimeoutMs=5000,rpcTimeoutMs=30000}={}){
 const child=new EventEmitter(),requests=[];let spawned=0,threads=0,turns=0,buffer='';
 child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',0));
 const send=message=>{const bytes=Buffer.from(JSON.stringify(message)+'\n');for(let i=0;i<bytes.length;i+=3)child.stdout.write(bytes.subarray(i,i+3));};
 const notify=(method,params)=>send({method,params}),reply=(id,result)=>send({id,result});
 const complete=(threadId,turnId,summary,status='completed')=>{notify('item/completed',{threadId,turnId,item:{id:'final',type:'agentMessage',phase:'final_answer',text:JSON.stringify({summary,files:[],controls:[]})}});notify('turn/completed',{threadId,turn:{id:turnId,status,error:status==='failed'?{message:'visible failure'}:null}});};
 child.stdin.on('data',bytes=>{buffer+=bytes.toString();let end;while((end=buffer.indexOf('\n'))>=0){const request=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);requests.push(request);if(request.method==='initialize')reply(request.id,{});if(request.method==='thread/start')reply(request.id,{thread:{id:'thread-'+(++threads)}});if(request.method==='turn/start'){const id='turn-'+(++turns);if(early)complete(request.params.threadId,id,'提前结果');if(!deferStarts)reply(request.id,{turn:{id,status:'inProgress'}});}if(request.method==='turn/interrupt'){reply(request.id,{});notify('turn/completed',{threadId:request.params.threadId,turn:{id:request.params.turnId,status:'interrupted'}});}if(request.method==='thread/unsubscribe'||request.method==='thread/backgroundTerminals/clean'&&!deferCleanup)reply(request.id,{});}});
 const provider=createCodexProvider({connection:testConnection(),cancelTimeoutMs,rpcTimeoutMs,spawnProcess:(command,args)=>{spawned++;assert.equal(command,'codex');assert.equal(args[0],'app-server');return child;}});
 const input={directory:'/tmp/design-proposal',model:{id:'vision',effort:'high'},schema:{type:'object'},prompt:'当前问题',imageFiles:['/tmp/current.png'],signal:new AbortController().signal};
 return {provider,child,requests,send,notify,complete,input,spawned:()=>spawned};
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw new Error('missing protocol event');}
test('Nonempty native deltas signal progress independently of public display limits and stay with their active turn',async()=>{
 const h=harness(),events=[],progress=[];try{
  const session=await h.provider.createSession(h.input),call=h.provider.runTurn({...h.input,session,onEvent:event=>events.push(event),onProgress:(...args)=>{progress.push(args);}});
  await until(()=>h.requests.some(r=>r.method==='turn/start'));
  const send=(method,extra={})=>h.notify(method,{threadId:session.threadId,turnId:'turn-1',itemId:'item',...extra});
  send('item/reasoning/textDelta',{delta:'PRIVATE_REASONING'});
  send('item/started',{item:{id:'final-stream',type:'agentMessage',phase:'final_answer',text:''}});
  send('item/agentMessage/delta',{itemId:'final-stream',delta:'PRIVATE_FINAL_SOURCE'});
  send('item/commandExecution/outputDelta',{delta:'x'.repeat(24000)});
  const count=events.length;send('item/commandExecution/outputDelta',{delta:'beyond display cap'});
  await until(()=>progress.length===4);assert.equal(events.length,count+1);assert.equal(events.at(-1).output.length,24000);
  send('item/reasoning/summaryTextDelta',{delta:'公开摘要'});
  send('item/reasoning/textDelta',{delta:''});send('item/agentMessage/delta',{turnId:'stale',delta:'STALE'});
  h.notify('item/reasoning/textDelta',{threadId:'other-thread',turnId:'turn-1',delta:'OTHER_THREAD'});
  await until(()=>progress.length===5);assert.ok(progress.every(args=>args.length===0));
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_REASONING|PRIVATE_FINAL_SOURCE|STALE|OTHER_THREAD/);
  h.complete(session.threadId,'turn-1','完成');await call;
  send('item/reasoning/textDelta',{delta:'late output'});assert.equal(progress.length,5);
 }finally{await h.provider.dispose();}
});

test('Native usage without turnId and compaction events are isolated by thread and preserve missing data',async()=>{
 const h=harness(),observationsA=[],observationsB=[];
 try{
  const a=await h.provider.createSession(h.input),b=await h.provider.createSession(h.input);
  const first=h.provider.runTurn({...h.input,session:a,onObservation:e=>observationsA.push(e)}),second=h.provider.runTurn({...h.input,session:b,onObservation:e=>observationsB.push(e)});
  await until(()=>h.requests.filter(r=>r.method==='turn/start').length===2);
  const usage={last:{inputTokens:500,cachedInputTokens:300,outputTokens:40,totalTokens:540},total:{inputTokens:1200,outputTokens:100,totalTokens:1300},modelContextWindow:200000};
  h.notify('thread/tokenUsage/updated',{threadId:a.threadId,tokenUsage:usage});
  h.notify('thread/tokenUsage/updated',{threadId:a.threadId,turnId:'stale',tokenUsage:usage});
  h.notify('thread/tokenUsage/updated',{threadId:b.threadId,tokenUsage:{last:{inputTokens:-1}}});
  h.notify('item/completed',{threadId:a.threadId,turnId:'turn-1',item:{id:'compact',type:'contextCompaction'}});
  await until(()=>observationsA.length===2);assert.equal(observationsA[0].usage.last.inputTokens,500);assert.equal(observationsA[0].usage.last.reasoningOutputTokens,undefined);assert.equal(observationsA[1].kind,'compaction');assert.equal(observationsB.length,0);
  h.complete(a.threadId,'turn-1','甲');h.complete(b.threadId,'turn-2','乙');await Promise.all([first,second]);
  const newer={...usage,total:{inputTokens:1300,outputTokens:110,totalTokens:1410}};
  h.notify('thread/tokenUsage/updated',{threadId:a.threadId,turnId:'turn-1',tokenUsage:newer});
  h.notify('thread/tokenUsage/updated',{threadId:a.threadId,turnId:'old-turn',tokenUsage:newer});
  h.notify('thread/tokenUsage/updated',{threadId:a.threadId,tokenUsage:usage});
  await until(()=>observationsA.length===3);assert.equal(observationsA[2].usage.total.totalTokens,1410);assert.equal(observationsB.length,0);
 }finally{await h.provider.dispose();}
});
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
  const starts=h.requests.filter(r=>r.method==='thread/start');assert.ok(starts.every(r=>r.params.ephemeral&&r.params.sandbox==='workspace-write'&&r.params.approvalPolicy==='on-request'));
  const params=h.requests.filter(r=>r.method==='turn/start').at(-1).params;assert.equal(params.threadId,a.threadId);assert.equal(params.model,'other');assert.equal(params.effort,'low');assert.deepEqual(params.outputSchema,{type:'string'});assert.deepEqual(params.input,[{type:'text',text:'当前问题'},{type:'localImage',path:'/tmp/current.png'}]);assert.equal(params.sandboxPolicy.type,'workspaceWrite');
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

test('Permission modes are frozen per native turn and switching away from full access restores the sandbox',async()=>{
 const h=harness();try{
  const session=await h.provider.createSession({...h.input,permissionMode:'read-only'});
  for(const [index,mode]of ['proposal','full-access','read-only'].entries()){
   const call=h.provider.runTurn({...h.input,session,permissionMode:mode});await until(()=>h.requests.filter(r=>r.method==='turn/start').length===index+1);
   const p=h.requests.filter(r=>r.method==='turn/start').at(-1).params;
   assert.equal(p.sandboxPolicy.type,({'proposal':'workspaceWrite','full-access':'dangerFullAccess','read-only':'readOnly'})[mode]);assert.equal(p.approvalPolicy,mode==='full-access'?'never':'on-request');assert.equal(p.approvalsReviewer,'user');
   if(mode==='proposal'){assert.deepEqual(p.sandboxPolicy.writableRoots,[h.input.directory]);assert.equal(p.sandboxPolicy.excludeSlashTmp,true);assert.equal(p.sandboxPolicy.excludeTmpdirEnvVar,true);}
   h.complete(session.threadId,'turn-'+(index+1),mode);await call;
  }
  assert.doesNotMatch(h.requests.find(r=>r.method==='thread/start').params.developerInstructions,/Do not use tools|run commands, access/);
  await assert.rejects(h.provider.runTurn({...h.input,session,permissionMode:'invalid'}),/权限模式无效/);
 }finally{await h.provider.dispose();}
});

test('Native approval requests stay with their turn, return explicit decisions and expire on interruption',async()=>{
 const h=harness(),pending=new Map();try{
  const [a,b]=await Promise.all([h.provider.createSession(h.input),h.provider.createSession(h.input)]),controller=new AbortController();
  const first=h.provider.runTurn({...h.input,session:a,signal:controller.signal,onApproval:(request,{signal})=>new Promise(resolve=>{pending.set('a',{request,resolve,signal});})});
  const second=h.provider.runTurn({...h.input,session:b,onApproval:request=>new Promise(resolve=>pending.set('b',{request,resolve}))});await until(()=>h.requests.filter(r=>r.method==='turn/start').length===2);
  h.send({id:'approval-a',method:'item/commandExecution/requestApproval',params:{threadId:a.threadId,turnId:'turn-1',itemId:'cmd-a',command:'node --version',cwd:'/tmp/a',reason:'确认工具版本'}});
  h.send({id:'approval-b',method:'item/fileChange/requestApproval',params:{threadId:b.threadId,turnId:'turn-2',itemId:'file-b',grantRoot:'/tmp/b',reason:'写入副本'}});await until(()=>pending.size===2);
  assert.equal(pending.get('a').request.command,'node --version');assert.equal(pending.get('b').request.kind,'file');pending.get('b').resolve({decision:'decline'});await until(()=>h.requests.some(r=>r.id==='approval-b'&&r.result));assert.deepEqual(h.requests.find(r=>r.id==='approval-b'&&r.result).result,{decision:'decline'});
  controller.abort();await assert.rejects(first,/取消/);assert.equal(pending.get('a').signal.aborted,true);assert.deepEqual(h.requests.find(r=>r.id==='approval-a'&&r.result).result,{decision:'cancel'});
  pending.get('a').resolve({decision:'accept'});await new Promise(r=>setImmediate(r));assert.equal(h.requests.filter(r=>r.id==='approval-a'&&r.result).length,1);
  h.complete(b.threadId,'turn-2','仍可继续');assert.equal((await second).summary,'仍可继续');
 }finally{await h.provider.dispose();}
});

test('Permission grants are turn-scoped and externally resolved approvals cannot later be accepted',async()=>{
 const h=harness(),pending=[];try{
  const session=await h.provider.createSession(h.input),call=h.provider.runTurn({...h.input,session,onApproval:(request,{signal})=>new Promise(resolve=>pending.push({request,resolve,signal}))});await until(()=>h.requests.some(r=>r.method==='turn/start'));
  const params={threadId:session.threadId,turnId:'turn-1',itemId:'permission',cwd:h.input.directory,permissions:{network:{enabled:true}}};
  h.send({id:'permission',method:'item/permissions/requestApproval',params});await until(()=>pending.length===1);pending[0].resolve({decision:'accept'});await until(()=>h.requests.some(r=>r.id==='permission'&&r.result));assert.deepEqual(h.requests.find(r=>r.id==='permission'&&r.result).result,{permissions:params.permissions,scope:'turn'});
  h.send({id:'resolved',method:'item/commandExecution/requestApproval',params:{...params,command:'echo ok'}});await until(()=>pending.length===2);h.notify('serverRequest/resolved',{threadId:session.threadId,requestId:'resolved'});assert.equal(pending[1].signal.aborted,true);pending[1].resolve({decision:'accept'});await new Promise(r=>setImmediate(r));assert.equal(h.requests.some(r=>r.id==='resolved'&&r.result),false);
  h.complete(session.threadId,'turn-1','完成');await call;
 }finally{await h.provider.dispose();}
});

test('A completed full-access turn keeps its slot until native background terminals are cleaned',async()=>{
 const h=harness({deferCleanup:true});try{
  const session=await h.provider.createSession(h.input);let settled=false,approvals=0;const call=h.provider.runTurn({...h.input,session,permissionMode:'full-access',onApproval:async()=>{approvals++;return {decision:'accept'};}}).then(result=>{settled=true;return result;});await until(()=>h.requests.some(r=>r.method==='turn/start'));
  h.complete(session.threadId,'turn-1','完成');await until(()=>h.requests.some(r=>r.method==='thread/backgroundTerminals/clean'));assert.equal(settled,false);await assert.rejects(h.provider.runTurn({...h.input,session,permissionMode:'read-only'}),/上一轮/);
  h.send({id:'late-approval',method:'item/commandExecution/requestApproval',params:{threadId:session.threadId,turnId:'turn-1',itemId:'late',command:'echo late'}});await until(()=>h.requests.some(r=>r.id==='late-approval'&&r.result));assert.equal(approvals,0);assert.deepEqual(h.requests.find(r=>r.id==='late-approval'&&r.result).result,{decision:'cancel'});
  const cleanup=h.requests.find(r=>r.method==='thread/backgroundTerminals/clean');h.send({id:cleanup.id,result:{}});await call;assert.equal(settled,true);
 }finally{await h.provider.dispose();}
});

test('Thread-scoped MCP confirmation with a null turnId receives a response and unsupported requests never hang',async()=>{
 const h=harness(),pending=[];try{
  const session=await h.provider.createSession(h.input),call=h.provider.runTurn({...h.input,session,onApproval:request=>new Promise(resolve=>pending.push({request,resolve}))});await until(()=>h.requests.some(r=>r.method==='turn/start'));
  h.send({id:'mcp',method:'mcpServer/elicitation/request',params:{threadId:session.threadId,turnId:null,serverName:'fixture',mode:'form',message:'确认工具访问',requestedSchema:{type:'object',required:['purpose'],properties:{purpose:{type:'string',title:'用途'}}}}});await until(()=>pending.length===1);assert.equal(pending[0].request.kind,'mcp');assert.equal(pending[0].request.fields[0].label,'用途');pending[0].resolve({decision:'accept',content:{purpose:'核对设计'}});await until(()=>h.requests.some(r=>r.id==='mcp'&&r.result));assert.deepEqual(h.requests.find(r=>r.id==='mcp'&&r.result).result,{action:'accept',content:{purpose:'核对设计'}});
  h.send({id:'unknown',method:'item/unknown/request',params:{threadId:session.threadId,turnId:null}});await until(()=>h.requests.some(r=>r.id==='unknown'&&r.error));h.complete(session.threadId,'turn-1','完成');await call;
 }finally{await h.provider.dispose();}
});
