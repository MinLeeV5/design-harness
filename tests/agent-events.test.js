import {test} from "node:test";
import assert from "node:assert/strict";
import {publicCodexEvent,createCodexEventReader} from "../workbench/src/backend/adapters/codex-events.mjs";
test("Codex activity accepts only public messages and metadata, never reasoning, command text or generated source",()=>{
 assert.equal(publicCodexEvent({type:"item.completed",item:{id:"bad",type:{toString:null}}}),null);
 for(const type of ["reasoning","reasoning_summary","unknown"])assert.equal(publicCodexEvent({type:"item.completed",item:{id:"secret",type,text:"PRIVATE_REASONING"}}),null);
 assert.deepEqual(publicCodexEvent({type:"item.completed",item:{id:"tool",type:"command_execution",command:"PRIVATE_COMMAND",aggregated_output:"PRIVATE_OUTPUT"}}),{id:"codex-tool-tool",label:"执行工具",status:"done"});
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
