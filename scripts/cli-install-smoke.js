// Install the real tarball into disposable projects and a disposable global prefix.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {spawn,execFile,spawnSync} from "node:child_process";
import {promisify} from "node:util";
import {pathToFileURL} from "node:url";
import {testConnection,memoryPreferences} from "../tests/helpers/codex-connection.mjs";

const execute=promisify(execFile),root=path.resolve(import.meta.dirname,".."),base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-install 中文 "));
const read=file=>JSON.parse(fs.readFileSync(file,"utf8"));
const manifest=read(path.join(root,"package.json"));
const run=async(command,args,cwd,env=process.env)=>{
  try { return (await execute(command,args,{cwd,env,maxBuffer:4_000_000,timeout:180000})).stdout; }
  catch(error) { throw new Error(command+" "+args.join(" ")+"\n"+(error.stderr||error.stdout||error.message)); }
};
const project=name=>{const directory=path.join(base,name);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,"package.json"),JSON.stringify({name:"cli-install-fixture",private:true,scripts:{"design:check":"design-harness check"}}));return directory;};

async function serve(entry,directory) {
  // No Codex on PATH: viewing existing assets must still work.
  const child=spawn(process.execPath,[entry,"serve","--project",directory,"--port","0"],{env:{...process.env,PATH:""},stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="",origin;
  child.stdout.on("data",data=>{stdout+=data;origin=/Design Harness: (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout)?.[1];});
  child.stderr.on("data",data=>{stderr+=data;});
  const exited=new Promise(resolve=>child.once("exit",resolve));
  try {
    const end=Date.now()+20000;
    while(!origin){assert.ok(child.exitCode===null&&Date.now()<end,stderr||stdout||"工作台启动超时");await new Promise(resolve=>setTimeout(resolve,30));}
    const response=await fetch(origin),html=await response.text();assert.equal(response.status,200);assert.match(html,/window\.__DH_DATA__/);
    return {workbench:true,codexRequired:false};
  } finally {
    child.kill("SIGTERM");
    const timer=setTimeout(()=>child.kill("SIGKILL"),5000);
    await exited;clearTimeout(timer);
    if(origin)await assert.rejects(fetch(origin),"停止命令后不应留下监听端口");
  }
}

async function verify(entry,directory,label) {
  assert.equal((await run(process.execPath,[entry,"--version"],directory)).trim(),manifest.version);
  const guidance=JSON.parse(await run(process.execPath,[entry,"skills"],directory));
  for(const skill of guidance.skills)assert.ok(fs.existsSync(skill.entry));
  assert.ok(fs.existsSync(guidance.shared));
  const implementation=guidance.skills.find(skill=>skill.name==="design-harness-implement");assert.ok(implementation);
  for(const selector of ["implement","design-harness-implement"]) {
    const selected=JSON.parse(await run(process.execPath,[entry,"skills",selector],directory));
    assert.deepEqual(selected.skills,[implementation]);
  }
  for(const file of ["workflow.md","evaluation.md","sources.md","adaptation.md"])assert.ok(fs.existsSync(path.join(path.dirname(implementation.entry),"references",file)));
  assert.equal(fs.existsSync(path.join(directory,"design-harness")),false,"工程实现指导无需初始化设计工作区");
  await run(process.execPath,[entry,"init","--example","--project",directory],directory);
  await run(process.execPath,[entry,"check","--project",directory],directory);
  await run(process.execPath,[entry,"typecheck","--project",directory],directory);
  const output=path.join(base,label+" 离线.html");
  await run(process.execPath,[entry,"export","example","--project",directory,"--out",output],directory);
  assert.match(fs.readFileSync(output,"utf8"),/<!doctype html>/i);
  const state=await serve(entry,directory);
  assert.equal(fs.existsSync(path.join(directory,"design-harness/node_modules")),false);
  assert.equal(fs.existsSync(path.join(directory,"design-harness/workbench")),false);
  console.log(JSON.stringify({installation:label,package:manifest.name,version:manifest.version,check:true,typecheck:true,export:true,guidance:true,...state}));
}

async function agent(packageRoot,directory) {
  const load=relative=>import(pathToFileURL(path.join(packageRoot,"workbench/src/backend",relative)).href);
  const {createLiveAgentRuntime}=await load("services/agent-runtime.mjs"),{loadRequirement}=await load("adapters/resource-store.mjs");
  const workspace=fs.realpathSync(path.join(directory,"design-harness")),file="candidates/comfortable/pages/task.json",source=path.join(workspace,"requirements/example",file),before=fs.readFileSync(source);
  let readPackagedGuidance=false;
  const runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),preferences:memoryPreferences(),capture:async()=>null,run:async({prompt})=>{
    const map=JSON.parse(prompt.match(/^Resource map: (.+)$/m)[1]);
    assert.equal(map.roots.plugin,packageRoot);
    const professional=map.entries.filter(item=>item.path.startsWith(packageRoot+path.sep));assert.ok(professional.length>3);
    for(const item of professional)assert.ok(fs.readFileSync(item.path,"utf8").length);
    readPackagedGuidance=true;
    const spec=JSON.parse(before);spec.elements["task-page"].props.title="独立 CLI Agent 验证";
    return {summary:"已使用安装包内的专业指导生成提案",files:[{path:file,content:JSON.stringify(spec,null,2)}],controls:[]};
  }});
  try {
    const session=runtime.createSession("example","comfortable"),job=await runtime.event({type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"visual",page:"task",capture:{page:"task",state:{phase:"new"}},prompt:"更新标题",expectedRevision:loadRequirement(workspace,"example").revision});
    const end=Date.now()+30000;let state;
    do { state=runtime.get(job.id,session.id);if(!["running","validating"].includes(state.state))break;assert.ok(Date.now()<end,"安装包 Agent 验证超时");await new Promise(resolve=>setTimeout(resolve,30)); } while(true);
    assert.equal(state.state,"ready",state.error||state.summary);assert.ok(readPackagedGuidance);assert.deepEqual(fs.readFileSync(source),before);
    await runtime.event({type:"accept",job:job.id,sessionId:session.id});assert.equal(read(source).elements["task-page"].props.title,"独立 CLI Agent 验证");
    console.log(JSON.stringify({installedAgent:"pass",engine:"deterministic fixture",packagedGuidance:true,browserValidation:true,accepted:true}));
  } finally { await runtime.close(); }
}

async function rejectHostImport(entry,directory) {
  const rogue=path.join(directory,"node_modules/unrelated-fixture"),file=path.join(directory,"design-harness/requirements/example/candidates/comfortable/components/Task.tsx"),before=fs.readFileSync(file);
  fs.mkdirSync(rogue);fs.writeFileSync(path.join(rogue,"index.js"),'export const unrelated="host-only";');
  try {
    fs.writeFileSync(file,'import '+JSON.stringify(path.join(rogue,"index.js"))+';\n'+before);
    await assert.rejects(run(process.execPath,[entry,"check","--project",directory],directory),/越界/);
    console.log(JSON.stringify({hoistedHostDependencyRejected:true}));
  } finally { fs.writeFileSync(file,before);fs.rmSync(rogue,{recursive:true,force:true}); }
}

async function liveAgent(packageRoot,directory) {
  const load=relative=>import(pathToFileURL(path.join(packageRoot,"workbench/src/backend",relative)).href);
  const {createLiveAgentRuntime}=await load("services/agent-runtime.mjs"),{loadRequirement}=await load("adapters/resource-store.mjs");
  const workspace=fs.realpathSync(path.join(directory,"design-harness"));
  const runtime=createLiveAgentRuntime(workspace,{preferences:memoryPreferences(),capture:async()=>null,timeoutMs:90000});
  try {
    const session=runtime.createSession("example","comfortable"),job=await runtime.event({type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"interaction",page:"task",permissionMode:"read-only",capture:{page:"task",state:{}},prompt:"这是独立 npm 安装包的真实 Agent 连接验证。只回答“独立 CLI Agent 连接验证通过”。本轮不进行设计分析、不读写文件、不调用任何工具，也不访问业务项目或网络资料。按输出协议返回 summary 以及空 files、controls。",expectedRevision:loadRequirement(workspace,"example").revision});
    const end=Date.now()+150000;let state;
    do {
      state=runtime.get(job.id,session.id);
      if(state.approvals.some(item=>item.state==="pending")){await runtime.event({type:"cancel",job:job.id,sessionId:session.id});throw new Error("真实连接验证遇到原生审批，已停止，未自动批准");}
      if(state.state!=="running")break;
      assert.ok(Date.now()<end,"真实安装包 Agent 连接验证超时");await new Promise(resolve=>setTimeout(resolve,200));
    } while(true);
    assert.equal(state.state,"answered",state.error||state.summary);assert.match(state.summary,/独立 CLI Agent 连接验证通过/);
    console.log(JSON.stringify({liveInstalledAgent:"pass",model:state.model.id,readOnly:true,changes:false}));
  } finally { await runtime.close(); }
}

try {
  const packed=JSON.parse(await run("npm",["pack","--ignore-scripts","--json","--pack-destination",base],root))[0];
  const files=packed.files.map(file=>file.path);
  for(const expected of ["workbench/cli.mjs","shared/references/agent.md","skills/design-harness-product/SKILL.md","skills/design-harness-implement/SKILL.md","skills/design-harness-implement/references/adaptation.md",".codex-plugin/plugin.json",".agents/plugins/marketplace.json"])assert.ok(files.includes(expected),expected);
  assert.ok(!files.some(file=>/^(?:scripts|tests|node_modules|dist|\.harness|openspec|design-harness)\//.test(file)));
  const archive=path.join(base,packed.filename),npmProject=project("npm 项目");
  await run("npm",["install","--save-dev","--save-exact","--ignore-scripts","--no-audit","--no-fund",archive],npmProject);
  const npmPackage=fs.realpathSync(path.join(npmProject,"node_modules",manifest.name)),npmCli=path.join(npmPackage,"workbench/cli.mjs");
  assert.equal(fs.existsSync(path.join(npmPackage,"package-lock.json")),false,"npm 安装包不携带源码锁文件");
  await verify(npmCli,npmProject,"npm-devDependency");
  await run("npm",["run","design:check"],npmProject);
  assert.ok(read(path.join(npmProject,"package.json")).devDependencies[manifest.name]);
  await rejectHostImport(npmCli,npmProject);
  await agent(npmPackage,npmProject);
  if(process.argv.includes("--live"))await liveAgent(npmPackage,npmProject);

  const prefix=path.join(base,"global prefix"),globalProject=project("全局启动项目");
  await run("npm",["install","--global","--prefix",prefix,"--ignore-scripts","--no-audit","--no-fund",archive],base);
  const globalBin=path.join(prefix,process.platform==="win32"?"design-harness.cmd":"bin/design-harness");
  const globalCli=path.join(prefix,process.platform==="win32"?"node_modules":"lib/node_modules",manifest.name,"workbench/cli.mjs");
  assert.ok(fs.existsSync(globalBin));assert.equal((await run(globalBin,["--version"],globalProject)).trim(),manifest.version);await verify(globalCli,globalProject,"npm-global");
  for(const entry of [globalCli,path.join(root,"workbench/cli.mjs")]) {
    const local=JSON.parse(await run(process.execPath,[entry,"skills","--project",npmProject],base));
    assert.equal(local.shared,path.join(npmPackage,"shared/references"));
  }
  console.log(JSON.stringify({projectVersionPreferred:true,globalAndPluginEntries:true}));
  await serve(globalCli,npmProject);

  if(spawnSync("pnpm",["--version"],{stdio:"ignore"}).status===0) {
    const pnpmProject=project("pnpm 项目");
    await run("pnpm",["add","--save-dev","--save-exact","--ignore-scripts","--prefer-offline","--config.hoist=false",archive],pnpmProject);
    const pnpmPackage=fs.realpathSync(path.join(pnpmProject,"node_modules",manifest.name));
    await verify(path.join(pnpmPackage,"workbench/cli.mjs"),pnpmProject,"pnpm-devDependency");
    await run("pnpm",["run","design:check"],pnpmProject);
    assert.ok(read(path.join(pnpmProject,"package.json")).devDependencies[manifest.name]);
  } else console.log("pnpm 未安装，跳过 pnpm 布局验证。");
} finally { fs.rmSync(base,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
