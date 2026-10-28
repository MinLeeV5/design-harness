import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {hostProjectRoot} from "../workbench/src/backend/adapters/host-project.mjs";
import {testConnection,memoryPreferences} from "./helpers/codex-connection.mjs";

const mapFor=prompt=>JSON.parse(prompt.match(/^Resource map: (.+)$/m)[1]);
async function done(runtime,job){const end=Date.now()+20000;while(runtime.get(job.id,job.sessionId).state==="running"){assert.ok(Date.now()<end,"请求未结束");await new Promise(resolve=>setTimeout(resolve,10));}return runtime.get(job.id,job.sessionId);}

test("Large resources remain complete on disk; maps expose the host and current copy without injecting bodies",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-context 中文 ")),workspace=initialize(root,{example:true}).workspace;
  const large="/* LARGE_RESOURCE_SENTINEL "+"x".repeat(950000)+" END_RESOURCE */";
  fs.writeFileSync(path.join(workspace,"foundation/large.css"),large);
  fs.writeFileSync(path.join(root,"AGENTS.md"),"HOST_RULE_SENTINEL");
  const calls=[],runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),preferences:memoryPreferences(),projectRoot:root,capture:async()=>null,run:async input=>{
    const map=mapFor(input.prompt);calls.push(map);
    assert.equal(map.roots.hostProject,fs.realpathSync(root));assert.equal(map.roots.sourceResources,fs.realpathSync(workspace));
    assert.equal(map.roots.proposal,input.directory);assert.notEqual(map.roots.proposal,workspace);
    for(const entry of map.entries)assert.ok(fs.existsSync(entry.path),entry.path);
    assert.equal(fs.readFileSync(path.join(map.roots.proposal,"foundation/large.css"),"utf8"),large);
    assert.equal(fs.readFileSync(path.join(map.roots.hostProject,"AGENTS.md"),"utf8"),"HOST_RULE_SENTINEL");
    const state=JSON.parse(fs.readFileSync(map.entries.find(e=>e.path.endsWith("/state.json")).path,"utf8"));assert.equal(state.secret,"STATE_SENTINEL");
    const selection=JSON.parse(fs.readFileSync(map.entries.find(e=>e.path.endsWith("/selection.json")).path,"utf8"));assert.equal(selection.html,"DOM_SENTINEL");
    assert.doesNotMatch(input.prompt,/LARGE_RESOURCE_SENTINEL|HOST_RULE_SENTINEL|STATE_SENTINEL|DOM_SENTINEL|模型按钮|权限 Tab|Markdown 展示/);
    assert.ok(input.prompt.length<20000,input.prompt.length);
    return {summary:"已按地图读取当前资料",files:[],controls:[]};
  }});
  try{
    const session=runtime.createSession("example","comfortable");
    const request={type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"interaction",page:"task",prompt:"解释当前设计",capture:{page:"task",state:{secret:"STATE_SENTINEL"}},selection:{domId:"node-1",target:"task-form",instance:"",label:"表单",tag:"form",html:"DOM_SENTINEL"},expectedRevision:loadRequirement(workspace,"example").revision};
    for(let i=0;i<2;i++)assert.equal((await done(runtime,await runtime.event(request))).state,"answered");
    assert.notEqual(calls[0].roots.proposal,calls[1].roots.proposal);
    const status=await runtime.connection({sessionId:session.id});assert.ok(status.observation.context.characters<20000);assert.equal(status.observation.context.imageCount,0);
    assert.equal(status.observation.usage,undefined);
  }finally{await runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});

test("Host lookup accepts resource directories, explicit roots and Git worktrees without following the main checkout",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-host-"));
  try{
    const plain=path.join(base,"plain"),resources=path.join(plain,"design-harness");fs.mkdirSync(resources,{recursive:true});
    assert.equal(hostProjectRoot(resources),fs.realpathSync(plain));assert.equal(hostProjectRoot(resources,plain),fs.realpathSync(plain));
    assert.throws(()=>hostProjectRoot(resources,os.tmpdir()+"/unrelated-missing"));
    // An unborn Git worktree is sufficient for rev-parse; creating a commit
    // would invoke user-installed Git wrappers/hooks unrelated to root lookup.
    const repo=path.join(base,"repo"),tree=path.join(base,"work tree"),common=path.join(repo,".git"),gitdir=path.join(common,"worktrees/probe"),folder=path.join(tree,"design-harness");
    for(const dir of [path.join(common,"objects"),path.join(common,"refs"),gitdir,folder])fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(common,"HEAD"),"ref: refs/heads/main\n");
    fs.writeFileSync(path.join(common,"config"),"[core]\n repositoryformatversion = 0\n bare = false\n");
    fs.writeFileSync(path.join(gitdir,"HEAD"),"ref: refs/heads/probe\n");fs.writeFileSync(path.join(gitdir,"commondir"),"../..\n");
    fs.writeFileSync(path.join(gitdir,"gitdir"),path.join(tree,".git")+"\n");fs.writeFileSync(path.join(tree,".git"),"gitdir: "+gitdir+"\n");
    assert.equal(hostProjectRoot(folder),fs.realpathSync(tree));
  }finally{fs.rmSync(base,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test("Usage, compactions and context metrics belong to their session and stay visible after completion",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-usage-")),workspace=initialize(root,{example:true}).workspace;
  let observed;
  const runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),preferences:memoryPreferences(),capture:async()=>null,run:async input=>{
    observed=input.sessionId;input.onObservation({kind:"usage",usage:{last:{inputTokens:123,cachedInputTokens:100,outputTokens:20,totalTokens:143},total:{inputTokens:400,outputTokens:50,totalTokens:450},modelContextWindow:200000,updatedAt:Date.now()}});
    for(let i=0;i<2;i++)input.onObservation({kind:"compaction",id:"compact-1",at:Date.now()});
    return {summary:"已完成",files:[],controls:[]};
  }});
  try{
    const a=runtime.createSession("example","comfortable"),b=runtime.createSession("example","comfortable");
    const job=await runtime.event({type:"message",sessionId:a.id,id:"example",candidate:"comfortable",role:"visual",page:"task",prompt:"讨论",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,"example").revision});
    const result=await done(runtime,job);assert.equal(observed,a.id);assert.equal(result.observation.compactions,1);
    assert.equal((await runtime.connection({sessionId:a.id})).observation.usage.last.inputTokens,123);
    assert.deepEqual((await runtime.connection({sessionId:b.id})).observation,{compactions:0});
  }finally{await runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
