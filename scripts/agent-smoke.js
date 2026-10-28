import {testConnection,memoryPreferences} from "../tests/helpers/codex-connection.mjs";
import {openSettings,selectPreview,openPanel,clickTool,chooseOption} from "./browser-ui.js";
// Chrome integration with the real local API and deterministic model output; no account/model call.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-agent-browser-")),workspace=initialize(base,{example:true}).workspace;
const file=path.join(workspace,"requirements/example/candidates/comfortable/pages/task.json"),other=path.join(workspace,"requirements/example/candidates/compact/pages/task.json"),before=fs.readFileSync(file),otherBefore=fs.readFileSync(other),calls=[],checks=[],errors=[];
const control={id:"rounding",label:"本次面板圆角",type:"range",binding:"prop",target:"task-form",property:"radius",min:4,max:28,step:2,unit:"px"};let failed=false;
const markdownPrompt="解析 **Markdown**\n\n`user_code`\n第二行";
const markdownReply='## 会话 **格式**\n\n这里有 **重点**、*说明*、~~删除~~与 `inline_code`。\n第一行\n第二行\n\n- 第一项\n  - 嵌套项\n- 第二项\n\n1. 操作\n2. 反馈\n\n> 引用说明\n\n| 字段 | 含义 | 状态 | 来源 | 备注 |\n| --- | --- | --- | --- | --- |\n| name | 名称 | 已确认 | 用户 | 保留全文 |\n\n```tsx\n  const node = <div>代码内容</div>;\n\tconst long = "'+"long_code_".repeat(32)+'";\n```\n\n[参考](https://example.com/docs) [危险](javascript:alert(1))\n\n![图片文字](https://example.invalid/private.png)\n\n<script>window.__markdownInjected=true</script>\n\n<img src=x onerror="window.__markdownInjected=true">';
let releaseMarkdown;
const service=await startServer(workspace,{agentPreferences:memoryPreferences(),agentConnection:testConnection(),port:0,agentRun:async({directory,prompt,signal,onEvent,session})=>{
 const text=JSON.parse(prompt.match(/User message: (.*)\n/)[1]);calls.push({text,prompt,session});
 if(text===markdownPrompt){
  onEvent({id:"markdown-note",label:"Markdown 进展",status:"running",text:'**正在分析**\n\n```ts\n  const pending = "未完成'});
  await new Promise((resolve,reject)=>{releaseMarkdown=resolve;signal.addEventListener("abort",()=>reject(new Error("已取消")),{once:true});});
  onEvent({id:"markdown-note",label:"Markdown 进展",status:"done",text:"**已完成分析**\n\n- 保留 `name`\n- 输出说明"});
  onEvent({id:"markdown-output",label:"命令输出",status:"done",command:"printf markdown",output:"# 原始输出\n**保留星号**",exitCode:0});
  return {summary:markdownReply,files:[],controls:[]};
 }
 if(text==="观察过程"){onEvent({id:"codex-turn",label:"生成回复或设计修改",status:"running"});await new Promise(resolve=>setTimeout(resolve,1800));onEvent({id:"public-note",label:"Agent 进展",status:"done",text:"正在核对这个区域的布局。"});await new Promise(resolve=>setTimeout(resolve,1800));return {summary:"当前布局已说明。",files:[],controls:[]};}
 if(text==="等待取消")return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("已取消")),{once:true}));
 if(text==="失败细化")throw new Error("夹具：细化失败");
 if(text==="失败一次"&&!failed){failed=true;throw new Error("夹具：可见失败与重试");}
 if(text.startsWith("解释")||text==="继续解释")return {summary:"这里是任务表单，可以先保持主次清晰，再调整留白。",files:[],controls:[]};
 const spec=JSON.parse(fs.readFileSync(path.join(directory,"requirements/example/candidates/comfortable/pages/task.json")));
 if(text==="延续当前预览"){assert.equal(spec.elements["task-form"].props.radius,22);spec.elements["task-page"].props.title="延续当前预览的标题";}else spec.elements["task-form"].props.radius=20;
 return {summary:text==="Markdown提案"?"### 提案 **摘要**\n\n- 已调整 `radius`\n\n```css\nborder-radius: 20px;\n```":"已生成局部视觉方案，可调整本次圆角后接受。",files:[{path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec,null,2)+"\n"}],controls:[control]};
}});
let browser;
async function check(label,run){await run();checks.push(label);console.log("PASS "+label);}
try{
 browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage({viewport:{width:1680,height:1250}});page.setDefaultTimeout(20000);page.on("pageerror",e=>errors.push(e.message));
 let releaseSnapshot;const snapshotGate=new Promise(resolve=>{releaseSnapshot=resolve;});let snapshotDone;const snapshotDelivered=new Promise(resolve=>{snapshotDone=resolve;});
 await page.route("**/__dh/live/session?*",async route=>{const response=await route.fetch();await snapshotGate;await route.fulfill({response});snapshotDone();});
 await page.goto(service.origin+"/?id=example");const owner=page.locator('iframe[title="产品预览 · comfortable"]'),frame=owner.contentFrame();await frame.getByRole("textbox",{name:"任务主题"}).waitFor();
 async function pick(){await page.getByRole("button",{name:"点选元素",exact:true}).click();const target=frame.locator(".product-surface");const r=await target.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+8,y:r.y+8,w:innerWidth,h:innerHeight};}),box=await owner.boundingBox();await page.mouse.click(box.x+r.x*box.width/r.w,box.y+r.y*box.height/r.h);await page.locator(".element-selection strong").waitFor();}
 async function send(text){if(!await page.getByRole("combobox",{name:"设计身份",exact:true}).getAttribute("data-value"))await chooseOption(page.getByRole("combobox",{name:"设计身份",exact:true}),"visual");await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill(text);await page.getByRole("button",{name:"发送",exact:true}).click();}
 await check("默认收起双抽屉，单一Agent没有预设控件与全局点选入口",async()=>{assert.equal(await page.getByRole("dialog").count(),0);assert.equal(await page.getByRole("button",{name:"点选界面",exact:true}).count(),0);assert.equal(await page.getByRole("button",{name:"Live 调整",exact:true}).count(),0);const beforeBox=await owner.boundingBox();await openSettings(page);assert.deepEqual(await owner.boundingBox(),beforeBox);await page.getByRole("button",{name:"关闭预览设置",exact:true}).click();await openPanel(page,"Agent");assert.deepEqual(await owner.boundingBox(),beforeBox);assert.equal(await page.getByRole("slider").count(),0);});
 await check("点选一次自动结束，恢复原操作，附件可移除和重新添加",async()=>{await pick();assert.equal(await page.locator(".studio-shell").getAttribute("data-picking"),"false");await frame.getByRole("textbox",{name:"任务主题",exact:true}).fill("正常操作");assert.equal(await frame.getByRole("textbox",{name:"任务主题",exact:true}).inputValue(),"正常操作");await page.getByRole("button",{name:"移除元素上下文",exact:true}).click();assert.equal(await page.locator(".element-selection").count(),0);await pick();assert.equal(await page.locator("#inspector-title").textContent(),"Agent");});
 await check("首次会话恢复前禁止发送，恢复后保留草稿与元素附件",async()=>{await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("解释这个区域");assert.equal(await page.getByRole("button",{name:"发送",exact:true}).isDisabled(),true);assert.equal(await page.getByRole("combobox",{name:"设计身份",exact:true}).isDisabled(),true);releaseSnapshot();await snapshotDelivered;await page.waitForFunction(()=>!document.querySelector('[aria-label="设计身份"]').disabled);assert.equal(await page.getByRole("textbox",{name:"发给 Agent",exact:true}).inputValue(),"解释这个区域");assert.equal(await page.locator(".element-selection").count(),1);await page.unroute("**/__dh/live/session?*");});
 await check("聊天有真实API回答和元素上下文，纯讨论不写资源",async()=>{await send("解释这个区域");await page.getByRole("log").getByText("这里是任务表单，可以先保持主次清晰，再调整留白。",{exact:true}).waitFor();assert.equal(await page.locator(".message-element").count(),1);assert.match(calls[0].prompt,/product-surface/);assert.deepEqual(fs.readFileSync(file),before);assert.equal(await page.getByRole("slider").count(),0);});
 await check("等待有loading和耗时，实际过程与回复进入当前会话记录",async()=>{await send("观察过程");await page.locator(".agent-waiting .loading-spinner").waitFor();await page.getByRole("log").getByText("生成回复或设计修改",{exact:true}).waitFor();await page.getByRole("log").getByText("正在核对这个区域的布局。",{exact:true}).waitFor();await page.getByRole("log").getByText("当前布局已说明。",{exact:true}).waitFor();assert.equal(await page.locator(".agent-waiting").count(),0);await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();await openPanel(page,"Agent");assert.equal(await page.getByRole("log").locator("article").count(),4);});
 await check("明确修改后才出现动态控件，调节立即影响实际预览",async()=>{await send("更紧凑");const slider=page.getByRole("slider",{name:"本次面板圆角",exact:true});await slider.waitFor();assert.equal(await slider.inputValue(),"20");assert.equal(await frame.locator(".product-surface").evaluate(el=>getComputedStyle(el).borderRadius),"20px");await slider.focus();await slider.press("ArrowRight");assert.equal(await frame.locator(".product-surface").evaluate(el=>getComputedStyle(el).borderRadius),"22px");assert.deepEqual(fs.readFileSync(file),before);});
 await check("关闭面板保留统一Agent中的预览、调节值与聊天草稿",async()=>{await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("延续当前预览");await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();await openPanel(page,"Agent");assert.equal(await page.getByRole("slider",{name:"本次面板圆角",exact:true}).inputValue(),"22");assert.equal(await page.getByRole("textbox",{name:"发给 Agent",exact:true}).inputValue(),"延续当前预览");});
 await check("细化失败后上一版预览和调节值仍可继续使用",async()=>{await send("失败细化");await page.getByRole("alert").filter({hasText:"上一版预览已保留"}).waitFor();assert.equal(await page.getByRole("slider",{name:"本次面板圆角",exact:true}).inputValue(),"22");assert.equal(await frame.locator(".product-surface").evaluate(el=>getComputedStyle(el).borderRadius),"22px");assert.equal(await page.getByRole("button",{name:"接受修改",exact:true}).isEnabled(),true);await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("延续当前预览");});
 await check("取消本轮细化恢复上一版控件和值",async()=>{await send("等待取消");await page.getByRole("button",{name:"取消生成",exact:true}).click();await page.getByRole("alert").filter({hasText:"上一版预览已保留"}).waitFor();assert.equal(await page.getByRole("slider",{name:"本次面板圆角",exact:true}).inputValue(),"22");await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("延续当前预览");});
 await check("继续对话基于已调节的临时方案，接受后写回真实Spec并恢复聊天",async()=>{await page.getByRole("button",{name:"发送",exact:true}).click();await frame.getByRole("heading",{name:"延续当前预览的标题",exact:true}).waitFor();assert.equal(calls.at(-1).session,calls[0].session);assert.equal(await page.getByRole("slider",{name:"本次面板圆角",exact:true}).inputValue(),"22");await page.getByRole("slider",{name:"本次面板圆角",exact:true}).press("ArrowRight");await page.evaluate(()=>{window.__acceptMarker=true;});await page.getByRole("button",{name:"接受修改",exact:true}).click();await page.getByRole("log").getByText("已接受",{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__acceptMarker),true);assert.equal(JSON.parse(fs.readFileSync(file)).elements["task-form"].props.radius,24);assert.deepEqual(fs.readFileSync(other),otherBefore);await openPanel(page,"Agent");assert.equal(await page.getByRole("log").locator("article").count(),12);await page.getByRole("log").getByText("已接受",{exact:true}).waitFor();});
 await check("切换候选隔离会话，返回后保留本候选聊天历史",async()=>{await selectPreview(page,"方案","compact");await page.waitForFunction(()=>document.querySelectorAll('[role="log"] article').length===0);await selectPreview(page,"方案","comfortable");await page.waitForFunction(()=>document.querySelectorAll('[role="log"] article').length===12);await send("继续解释");await page.waitForFunction(()=>document.querySelectorAll('[role="log"] article').length===14);assert.equal(calls.at(-1).session,calls[0].session);});
 await check("放弃和取消不改项目文件，失败可见且可重试",async()=>{const saved=fs.readFileSync(file);await send("更紧凑");await page.getByRole("button",{name:"放弃预览",exact:true}).click();assert.deepEqual(fs.readFileSync(file),saved);await send("等待取消");await page.getByRole("button",{name:"取消生成",exact:true}).click();await page.getByRole("button",{name:"取消生成",exact:true}).waitFor({state:"hidden"});assert.deepEqual(fs.readFileSync(file),saved);await send("失败一次");await page.getByRole("alert").filter({hasText:"夹具：可见失败与重试"}).waitFor();await send("失败一次");await page.getByRole("button",{name:"放弃预览",exact:true}).click();assert.deepEqual(fs.readFileSync(file),saved);});
 await check("延迟接受失败期间的轮询保留用户调节值与预览",async()=>{await send("更紧凑");await page.getByRole("button",{name:"接受修改",exact:true}).waitFor();const slider=page.getByRole("slider",{name:"本次面板圆角",exact:true});await slider.press("ArrowRight");assert.equal(await slider.inputValue(),"22");fs.appendFileSync(file,"\n");await page.route("**/__dh/live/events",async route=>{if(route.request().postDataJSON().type!=="accept"){await route.continue();return;}const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,1500));await route.fulfill({response});});await page.getByRole("button",{name:"接受修改",exact:true}).click();await page.getByRole("alert").filter({hasText:"源资源已被修改"}).waitFor();await page.unroute("**/__dh/live/events");assert.equal(await slider.inputValue(),"22");assert.equal(await frame.locator(".product-surface").evaluate(el=>getComputedStyle(el).borderRadius),"22px");assert.equal(JSON.parse(fs.readFileSync(file)).elements["task-form"].props.radius,24);await page.getByRole("button",{name:"放弃预览",exact:true}).click();});
 await check("比较画面首次点选另一候选保留具体元素附件",async()=>{await page.reload();await clickTool(page,"对比方案");await openPanel(page,"Agent");await page.getByRole("button",{name:"点选元素",exact:true}).click();const secondOwner=page.locator('iframe[title="产品预览 · compact"]'),second=secondOwner.contentFrame(),r=await second.getByRole("button",{name:"＋ 新建整理",exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};}),box=await secondOwner.boundingBox();await page.mouse.click(box.x+r.x*box.width/r.w,box.y+r.y*box.height/r.h);await page.waitForFunction(()=>document.querySelector('[aria-label="方案"]').getAttribute("data-value")==="compact");await page.locator(".element-selection strong").filter({hasText:"button"}).waitFor();assert.equal(await page.locator("#inspector-title").textContent(),"Agent");await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();await clickTool(page,"对比方案");await selectPreview(page,"方案","comfortable");});
 await check("离开正在细化的候选保持后台运行，不阻断另一候选聊天",async()=>{await openPanel(page,"Agent");await send("更紧凑");await page.getByRole("button",{name:"接受修改",exact:true}).waitFor();await send("等待取消");await page.getByRole("button",{name:"取消生成",exact:true}).waitFor();await selectPreview(page,"方案","compact");await page.waitForTimeout(100);await send("解释这个区域");await page.getByRole("log").getByText("这里是任务表单，可以先保持主次清晰，再调整留白。",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"接受修改",exact:true}).count(),0);});
 await check("手机聊天浮层不溢出，视口尺寸不变",async()=>{await page.reload();await page.setViewportSize({width:360,height:980});await openPanel(page,"Agent");const box=await page.getByRole("dialog",{name:"Agent",exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=360&&box.y+box.height<=980);assert.equal(await page.locator("html").evaluate(el=>el.scrollWidth<=innerWidth),true);assert.equal(await page.locator(".frame-column:not([hidden]) iframe").contentFrame().locator("html").evaluate(()=>innerWidth),1440);});
 await check("会话正文与增量过程解析Markdown，未闭合代码块可读且源消息保留",async()=>{
  await page.setViewportSize({width:1680,height:1250});await selectPreview(page,"方案","comfortable");await openPanel(page,"Agent");
  const previousSession=await page.getByRole("combobox",{name:"Agent 会话",exact:true}).getAttribute("data-value");
  await page.getByRole("button",{name:"新建会话",exact:true}).click();
  await page.waitForFunction(id=>document.querySelector('[aria-label="Agent 会话"]').getAttribute("data-value")!==id,previousSession);
  await page.waitForFunction(()=>!document.querySelector('[data-agent-model-settings]').disabled);
  await send(markdownPrompt);
  const process=page.locator(".agent-message.assistant").last().locator(".agent-process");
  await process.locator(".markdown-content strong").filter({hasText:"正在分析"}).waitFor();
  assert.equal(await process.locator("pre code.language-ts").textContent(),'  const pending = "未完成\n');
  assert.equal(await page.locator(".agent-message.user .markdown-content strong").textContent(),"Markdown");
  assert.equal(await page.locator(".agent-message.user .markdown-content code").textContent(),"user_code");
  releaseMarkdown();
  const reply=page.locator(".agent-message.assistant").last().locator(":scope > .markdown-content");
  await reply.getByRole("heading",{name:"会话 格式",exact:true}).waitFor();
  assert.equal(calls.at(-1).text,markdownPrompt);
  assert.equal(await reply.locator("h2 strong").textContent(),"格式");
  assert.equal(await reply.locator("ul ul li").textContent(),"嵌套项");
  assert.equal(await reply.locator("ol li").count(),2);
  assert.equal(await reply.locator("blockquote").textContent(),"\n引用说明\n");
  assert.equal(await reply.locator("table tbody tr").count(),1);
  assert.equal(await reply.locator("p").first().locator("br").count(),2);
  assert.match(await reply.locator("pre code.language-tsx").textContent(),/^  const node = <div>代码内容<\/div>;\n\tconst long/);
  assert.equal(await reply.getByRole("link",{name:"参考",exact:true}).getAttribute("href"),"https://example.com/docs");
  assert.ok((await reply.getByRole("link",{name:"危险",exact:true}).getAttribute("href")).startsWith("#"));
  assert.equal(await reply.locator("script,img,svg").count(),0);
  assert.equal(await page.evaluate(()=>window.__markdownInjected),undefined);
  await process.locator(":scope > summary").click();
  assert.equal(await process.locator(".markdown-content strong").textContent(),"已完成分析");
  assert.equal(await process.locator(".markdown-content li").count(),2);
  assert.equal(await process.locator(".markdown-content li").first().evaluate(el=>getComputedStyle(el).display),"list-item");
  await process.locator(".agent-output > summary").click();
  assert.equal(await process.locator(".agent-output pre").textContent(),"# 原始输出\n**保留星号**");
 });
 await check("代码与表格在桌面及360/320px内横向滚动，刷新恢复富文本且不改变画布",async()=>{
  for(const width of [1680,360,320]){
   await page.setViewportSize({width,height:980});
   const reply=page.locator(".agent-message.assistant").last().locator(":scope > .markdown-content");
   const code=reply.locator("pre");await code.scrollIntoViewIfNeeded();
   assert.equal(await code.evaluate(el=>getComputedStyle(el).whiteSpace),"pre");
   assert.ok(await code.evaluate(el=>el.scrollWidth>el.clientWidth));
   assert.ok(await code.evaluate(el=>{el.scrollLeft=80;return el.scrollLeft>0;}));
   if(width<400){const table=reply.locator("table");assert.ok(await table.evaluate(el=>el.scrollWidth>el.clientWidth));assert.ok(await table.evaluate(el=>{el.scrollLeft=40;return el.scrollLeft>0;}));}
   const dialog=await page.getByRole("dialog",{name:"Agent",exact:true}).boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width);
   assert.equal(await page.locator("html").evaluate(el=>el.scrollWidth<=innerWidth),true);
   assert.equal(await owner.contentFrame().locator("html").evaluate(()=>innerWidth),1440);
   const output=process.env.DH_AGENT_SCREENSHOTS;if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,"agent-markdown-"+width+".png")});}
  }
  await page.reload();await openPanel(page,"Agent");await page.getByRole("log").getByRole("heading",{name:"会话 格式",exact:true}).waitFor();
  const restored=page.locator(".agent-message.assistant").last();assert.equal(await restored.locator("code.language-tsx").count(),1);
  await restored.locator(".agent-process > summary").click();assert.equal(await restored.locator(".markdown-content strong").filter({hasText:"已完成分析"}).count(),1);
  assert.equal(await restored.locator("script,img,svg").count(),0);
 });
 await check("提案摘要解析Markdown，文件前后内容继续按代码展示",async()=>{
  await page.setViewportSize({width:1680,height:1250});await send("Markdown提案");await page.getByRole("button",{name:"接受修改",exact:true}).waitFor();
  const proposal=page.locator(".agent-result");assert.equal(await proposal.locator(".markdown-content h3 strong").textContent(),"摘要");
  assert.equal(await proposal.locator(".markdown-content li code").textContent(),"radius");
  assert.equal(await proposal.locator(".markdown-content pre code.language-css").textContent(),"border-radius: 20px;\n");
  await proposal.getByText("查看修改文件（1）",{exact:true}).click();await proposal.getByText("candidates/comfortable/pages/task.json",{exact:true}).click();
  assert.match(await proposal.locator("details details pre").last().textContent(),/"radius": 20/);
  await page.getByRole("button",{name:"放弃预览",exact:true}).click();
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({agentIntegration:"deterministic model fixture; real API and Chrome",passed:checks.length,errors}));
}finally{await browser?.close();await service.close();fs.rmSync(base,{recursive:true,force:true});}
