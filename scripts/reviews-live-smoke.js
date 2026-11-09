// Explicit local verification: uses the logged-in Codex and never joins the default test suite.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {StringDecoder} from "node:string_decoder";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {buildRequirement} from "../workbench/src/backend/services/preview.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {createReviewService} from "../workbench/src/backend/services/reviews.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {createCodexProvider} from "../workbench/src/backend/adapters/codex-app-server.mjs";
import {memoryPreferences} from "../tests/helpers/codex-connection.mjs";

const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-live-")),workspace=initialize(project,{example:true}).workspace,folder=path.join(workspace,"requirements/example");let browser,runtime;
const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json")));manifest.pages.push({id:"details",title:"详情页面"});for(const candidate of manifest.candidates){candidate.pages.details="candidates/"+candidate.id+"/pages/details.json";const spec=JSON.parse(fs.readFileSync(path.join(folder,candidate.pages.task)));spec.elements["task-page"].props.title="详情原始标题";fs.writeFileSync(path.join(folder,candidate.pages.details),JSON.stringify(spec));}fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest));const scenarios=JSON.parse(fs.readFileSync(path.join(folder,"scenarios.json")));scenarios.push({id:"details-start",page:"details",title:"详情初始状态",state:{phase:"new"}});fs.writeFileSync(path.join(folder,"scenarios.json"),JSON.stringify(scenarios));
const viewed=new Set();let readReviews=false;
// Observe completed public tool items only; no reasoning, full protocol or model output is retained.
function trackedSpawn(...args){const child=spawn(...args),decoder=new StringDecoder("utf8");let buffer="";child.stdout.on("data",bytes=>{buffer+=decoder.write(bytes);let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line),item=event.params?.item;if(event.method!=="item/completed"||!item||item.error||item.status==="failed")continue;
      if(item.type==="commandExecution"&&typeof item.command==="string"&&/reviews\.json/.test(item.command))readReviews=true;
      const tool=item.type==="imageView"?JSON.stringify(item):item.type==="mcpToolCall"&&/view_image|image.*view/i.test(item.tool??"")?JSON.stringify(item.arguments??{}):"";
      for(const match of tool.matchAll(/review-([a-f0-9]{32})\.png/g))viewed.add(match[1]);
    }catch{/* Ignore non-tool diagnostics. */}}if(buffer.length>4000000)buffer="";});return child;}
try{
  const {payload}=await buildRequirement(workspace,"example");browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage({viewport:{width:1100,height:1000}}),reviews=createReviewService(workspace),captures=[];
  for(const pageId of ["task","details"]){await page.goto("about:blank");await page.setContent('<iframe sandbox="allow-scripts" style="width:900px;height:900px;border:0"></iframe>');const config={scenario:payload.scenarios.find(s=>s.page===pageId),candidate:"comfortable",page:pageId,pages:manifest.pages.map(p=>p.id),session:"live-"+pageId,spec:payload.specs["comfortable:"+pageId],css:payload.params.comfortable.css,pick:false,reviewPick:true};
    await page.evaluate(({html,config})=>{window.addEventListener("message",e=>{if(e.source!==document.querySelector("iframe").contentWindow)return;if(e.data.type==="dh:mounted")e.source.postMessage({type:"dh:config",config},"*");if(e.data.type==="dh:context")window.liveReviewContext=e.data.context;if(e.data.type==="dh:review-point")window.liveReviewPoint=e.data;});document.querySelector("iframe").srcdoc=html;},{html:payload.previews.comfortable,config});
    await page.locator("iframe").contentFrame().locator("h1").click();await page.waitForFunction(()=>window.liveReviewPoint);const actual=await page.evaluate(()=>({point:window.liveReviewPoint,state:window.liveReviewContext?.state??{}})),capture={html:actual.point.html,width:actual.point.anchor.view.width,height:actual.point.anchor.view.height,page:pageId,state:actual.state};captures.push(capture);
    const title=pageId==="task"?"批阅验证完成 · 主页面":"批阅验证完成 · 详情页面";await reviews.create({action:"create",id:"example",candidate:"comfortable",page:pageId,expectedVersion:reviews.read("example","comfortable").version,designRevision:loadRequirement(workspace,"example").revision,anchor:actual.point.anchor,capture,text:"请将本页 task-page 的 title 精确设为“"+title+"”，仅调整这一项。"});
  }
  await browser.close();browser=null;
  const selected=reviews.read("example","comfortable").threads;runtime=createLiveAgentRuntime(workspace,{reviews,preferences:memoryPreferences(),provider:createCodexProvider({spawnProcess:trackedSpawn}),timeoutMs:180000});
  const session=runtime.createSession("example","comfortable"),job=await runtime.event({type:"message",sessionId:session.id,id:"example",candidate:"comfortable",role:"visual",page:"task",prompt:"这是临时合成项目的批阅链路验证，请直接处理所附两条批阅。先读取 reviews.json，并用图片查看工具逐条查看 context 中 review-<ID>.png 历史截图（不要仅查看 current-view.png），核对页面和落点。严格按评语仅修改两个页面 Spec 的 task-page.props.title。只通过最终结构化 files 返回这两个 JSON 的完整内容，不直接写入副本。不要修改 React/CSS、公共基础、场景或其他文件，不运行构建、验证或安装，宿主会执行必要验证；不访问外部项目或网络，不请求扩展权限。完成后返回结构化修改，并逐条说明处理结果。",capture:captures[0],reviewIds:selected.map(t=>t.id),expectedRevision:loadRequirement(workspace,"example").revision});
  const deadline=Date.now()+300000;let last="";let ready;
  for(;;){const value=runtime.get(job.id,session.id),progress=value.state+":"+(value.messages.at(-1)?.activity?.length??0)+":"+viewed.size;if(progress!==last){console.log("真实 Codex 进度："+progress);last=progress;}if(value.approvals.some(a=>a.state==="pending")){const pending=value.approvals.find(a=>a.state==="pending");console.log(JSON.stringify({nativeApproval:{kind:pending.kind,title:pending.title,reason:pending.reason,command:pending.command,cwd:pending.cwd,details:pending.details}}));await runtime.event({type:"cancel",sessionId:session.id,job:job.id});throw new Error("真实验证遇到原生审批，已停止，未自动批准");}if(value.state==="ready"){ready=value;break;}assert.ok(!["failed","answered","cancelled"].includes(value.state),value.error||value.summary||value.state);if(Date.now()>deadline){await runtime.event({type:"cancel",sessionId:session.id,job:job.id});throw new Error("真实批阅验证超过时限，已停止");}await new Promise(r=>setTimeout(r,750));}
  assert.ok(readReviews,"需有读取 reviews.json 的实际工具证据");for(const thread of selected)assert.ok(viewed.has(thread.id),"未取得该批阅历史截图的查看证据："+thread.id);
  assert.ok(ready.proposal.changes.some(c=>c.path==="candidates/comfortable/pages/task.json"));assert.ok(ready.proposal.changes.some(c=>c.path==="candidates/comfortable/pages/details.json"));
  await runtime.event({type:"accept",sessionId:session.id,job:job.id,values:{}});for(const pageId of ["task","details"]){const spec=JSON.parse(fs.readFileSync(path.join(folder,"candidates/comfortable/pages",pageId+".json")));assert.equal(spec.elements["task-page"].props.title,pageId==="task"?"批阅验证完成 · 主页面":"批阅验证完成 · 详情页面");}
  assert.ok(reviews.read("example","comfortable").threads.every(t=>!t.resolved));for(const thread of selected)reviews.change({action:"resolve",id:"example",candidate:"comfortable",thread:thread.id,expectedVersion:reviews.read("example","comfortable").version});assert.ok(reviews.read("example","comfortable").threads.every(t=>t.resolved));
  const usage=runtime.get(job.id,session.id).observation?.usage;console.log(JSON.stringify({liveReview:"pass",model:ready.messages[0].model?.id,reviewCount:selected.length,viewedHistoricalImages:viewed.size,readReviewData:readReviews,changedPages:2,accepted:true,manuallyResolved:true,usage:usage?.last?.totalTokens??null}));
}finally{await browser?.close();await runtime?.close();fs.rmSync(project,{recursive:true,force:true});}
