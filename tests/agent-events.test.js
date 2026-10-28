import {test} from "node:test";
import assert from "node:assert/strict";
import {publicCodexEvent,createCodexEventReader,createCodexActivityStream} from "../workbench/src/backend/adapters/codex-events.mjs";
test("Codex activity exposes commands and output while keeping raw reasoning and structured proposals private",()=>{
 assert.equal(publicCodexEvent({type:"item.completed",item:{id:"bad",type:{toString:null}}}),null);
 for(const type of ["reasoning","reasoning_summary","unknown"])assert.equal(publicCodexEvent({type:"item.completed",item:{id:"secret",type,text:"PRIVATE_REASONING"}}),null);
 assert.deepEqual(publicCodexEvent({type:"item.completed",item:{id:"tool",type:"command_execution",command:"PRIVATE_COMMAND",aggregated_output:"PRIVATE_OUTPUT"}}),{id:"codex-tool-tool",label:"执行命令",kind:"command",status:"done",command:"PRIVATE_COMMAND",output:"PRIVATE_OUTPUT",truncated:false});
 assert.equal(publicCodexEvent({type:"item.completed",item:{id:"json",type:"agent_message",text:'{"summary":"ok","files":["PRIVATE_SOURCE"]}'}}),null);
 assert.equal(publicCodexEvent({type:"item.completed",item:{id:"code",type:"agent_message",text:'```json\nPRIVATE_SOURCE'}}),null);
 for(const text of ['修改已准备好：\n```json\n{"summary":"完成","files":[{"content":"PRIVATE_SOURCE"}],"controls":[]}\n```','方案如下：{"files":[{"content":"PRIVATE_SOURCE"}]}','渲染内容：<section>PRIVATE_SOURCE</section>'])assert.equal(publicCodexEvent({type:"item.completed",item:{id:"mixed",type:"agent_message",text}}),null);
 assert.equal(publicCodexEvent({type:"item.completed",item:{id:"text",type:"agent_message",text:"正在核对布局"}}).text,"正在核对布局");
});
test("JSONL reader handles split UTF-8, multiple events, invalid/oversized lines and final unclosed newline",()=>{
 const output=[],reader=createCodexEventReader(event=>output.push(event));
 const raw=Buffer.from(JSON.stringify({type:"item.completed",item:{id:"a",type:"agent_message",text:"核对布局"}})+"\n"+JSON.stringify({type:"turn.started"}));
 for(let i=0;i<raw.length;i+=2)reader.write(raw.subarray(i,i+2));reader.end();
 assert.equal(output[0].text,"核对布局");assert.equal(output[1].status,"running");
 const next=[],bounded=createCodexEventReader(event=>next.push(event));bounded.write(Buffer.from("x".repeat(70000)));bounded.write(Buffer.from('\nnot-json\n'+JSON.stringify({type:"turn.completed"})+'\n'));bounded.end();assert.equal(next.length,1);assert.equal(next[0].status,"done");
});

test("Malformed progress and observer failures cannot interrupt the JSONL reader",()=>{
 let count=0;const reader=createCodexEventReader(()=>{count++;throw new Error("observer failure");});
 assert.doesNotThrow(()=>{reader.write(Buffer.from(JSON.stringify({type:"item.completed",item:{id:"bad",type:{toString:null}}})+"\n"+JSON.stringify({type:"turn.started"})+"\n"));reader.end();});assert.equal(count,1);
});

test("Native public summaries, commentary and command deltas accumulate independently without exposing raw reasoning or final JSON",()=>{
 const events=[],stream=createCodexActivityStream(event=>events.push(event));
 const send=(method,params)=>stream({method,params});
 send('item/reasoning/textDelta',{itemId:'r',delta:'PRIVATE_RAW_REASONING'});
 send('item/reasoning/summaryTextDelta',{itemId:'r',delta:'检查布局'});send('item/reasoning/summaryTextDelta',{itemId:'r',delta:'与交互'});
 send('item/started',{item:{id:'m',type:'agentMessage',phase:'commentary',text:''}});send('item/agentMessage/delta',{itemId:'m',delta:'正在检查 '});send('item/agentMessage/delta',{itemId:'m',delta:'`task.json`'});
 send('item/started',{item:{id:'c',type:'commandExecution',command:'node --version',cwd:'/tmp/proposal',status:'inProgress'}});send('item/commandExecution/outputDelta',{itemId:'c',delta:'v22.'});send('item/commandExecution/outputDelta',{itemId:'c',delta:'0.0\n'});
 send('item/completed',{item:{id:'c',type:'commandExecution',command:'node --version',status:'completed',aggregatedOutput:'v22.0.0\n',exitCode:0}});
 send('item/started',{item:{id:'final',type:'agentMessage',phase:'final_answer',text:''}});send('item/agentMessage/delta',{itemId:'final',delta:'{"files":["PRIVATE_SOURCE"]}'});send('item/completed',{item:{id:'final',type:'agentMessage',phase:'final_answer',text:'{"files":["PRIVATE_SOURCE"]}'}});
 assert.equal(events.findLast(event=>event.kind==='reasoning').text,'检查布局与交互');assert.equal(events.findLast(event=>event.kind==='message').text,'正在检查 `task.json`');const command=events.findLast(event=>event.kind==='command');assert.equal(command.output,'v22.0.0\n');assert.equal(command.exitCode,0);assert.equal(command.status,'done');assert.doesNotMatch(JSON.stringify(events),/PRIVATE_RAW_REASONING|PRIVATE_SOURCE/);
 send('item/commandExecution/outputDelta',{itemId:'long',delta:'x'.repeat(100000)});assert.equal(events.at(-1).output.length,24000);assert.equal(events.at(-1).truncated,true);
});
