import {testConnection,memoryPreferences} from "../tests/helpers/codex-connection.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {openPanel,chooseOption,choiceOptions} from "./browser-ui.js";

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"dh-role-browser-")),workspace=initialize(temporary,{example:true}).workspace;
const root=path.join(workspace,"requirements/example"),documentFile=path.join(root,"interactions/task.md"),specFile=path.join(root,"candidates/comfortable/pages/task.json"),before=fs.readFileSync(documentFile),beforeSpec=fs.readFileSync(specFile),calls=[],requests=[],checks=[],errors=[];
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nq8AAAAASUVORK5CYII=","base64");
const service=await startServer(workspace,{agentPreferences:memoryPreferences(),agentConnection:testConnection(),port:0,agentRun:async({directory,prompt,imageFiles,session})=>{
  const message=JSON.parse(prompt.match(/User message: (.*)\n/)[1]);calls.push({prompt,images:imageFiles.length,session});assert.ok(imageFiles.length>=1);assert.equal(fs.readFileSync(imageFiles[0]).readUInt32BE(16),1440);
  if(message.startsWith("讨论"))return {summary:message==="讨论审美"?"先明确阅读偏好，再比较视觉方向。":"沿用已确认方向，检查触发、反馈与恢复。",files:[],controls:[]};
  const staged=path.join(directory,"requirements/example"),spec=JSON.parse(fs.readFileSync(path.join(staged,"candidates/comfortable/pages/task.json"))),scenarios=JSON.parse(fs.readFileSync(path.join(staged,"scenarios.json")));spec.elements["task-page"].props.title="专业设计提案";
  scenarios[0].id="renamed-initial";const manifest=JSON.parse(fs.readFileSync(path.join(staged,"manifest.json")));manifest.viewports[0].id="renamed-viewport";
  scenarios.push({id:"retry-review",page:"task",title:"提案恢复场景",state:{phase:"error",topic:"保留输入"}});
  return {summary:"补充恢复说明、场景和页面表达。",files:[
    {path:"interactions/task.md",content:fs.readFileSync(path.join(staged,"interactions/task.md"),"utf8").replace("## 输入与校验","## 完整输入说明")},
    {path:"scenarios.json",content:JSON.stringify(scenarios)},
    {path:"manifest.json",content:JSON.stringify(manifest)},
    {path:"candidates/comfortable/pages/task.json",content:JSON.stringify(spec)}
  ],controls:[{id:"density",label:"提案内容间距",type:"range",binding:"prop",target:"task-form",property:"gap",min:12,max:36,step:4,unit:"px"}]};
}});
let browser;
async function check(label,run){await run();checks.push(label);console.log("PASS "+label);}
try{
  browser=await chromium.launch({channel:"chrome",headless:true});const context=await browser.newContext(),page=await context.newPage();await page.setViewportSize({width:1680,height:1250});page.setDefaultTimeout(20000);page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(request.url().endsWith("/__dh/live/events")&&request.method()==="POST")requests.push(request.postDataJSON());});
  await page.goto(service.origin+"/?id=example");const frame=page.locator('iframe[title="产品预览 · comfortable"]').contentFrame();await frame.getByRole("textbox",{name:"任务主题",exact:true}).fill("用户刚输入的会话主题");await openPanel(page,"Agent");
  const identity=page.getByRole("combobox",{name:"设计身份",exact:true}),prompt=page.getByRole("textbox",{name:"发给 Agent",exact:true}),send=page.getByRole("button",{name:"发送",exact:true});
  await check("首次默认交互身份，切换视觉使用真实Skill和当前画面",async()=>{
    await prompt.fill("讨论审美");await page.waitForFunction(()=>!document.querySelector('[aria-label="模型"]').disabled&&document.querySelector('[aria-label="模型"]').getAttribute("aria-busy")!=="true");assert.equal(await identity.getAttribute("data-value"),"interaction");assert.equal(await send.isEnabled(),true);await chooseOption(identity,"visual");
    await page.getByLabel("参考图文件",{exact:true}).setInputFiles({name:"审美参考.png",mimeType:"image/png",buffer:png});await page.getByAltText("审美参考.png",{exact:true}).waitFor();await send.click();
    await page.getByRole("log").getByText("先明确阅读偏好，再比较视觉方向。",{exact:true}).waitFor();assert.equal(await page.getByRole("log").getByText("视觉设计 Agent",{exact:true}).count(),1);assert.equal(calls[0].images,2);assert.match(calls[0].prompt,/design-harness-visual/);assert.match(requests[0].capture.html,/value="用户刚输入的会话主题"/);assert.doesNotMatch(requests[0].capture.html,/<script[\s>]/i);assert.deepEqual(fs.readFileSync(specFile),beforeSpec);
  });
  await check("身份切换承接同一会话，参考图保留到主动移除",async()=>{
    assert.equal(await page.getByAltText("审美参考.png",{exact:true}).count(),1);await chooseOption(identity,"interaction");await prompt.fill("讨论恢复路径");await send.click();await page.getByRole("log").getByText("沿用已确认方向，检查触发、反馈与恢复。",{exact:true}).waitFor();assert.equal(await page.getByRole("log").locator("article").count(),4);assert.equal(await page.getByRole("log").getByText("交互设计 Agent",{exact:true}).count(),1);assert.equal(calls[1].session,calls[0].session);assert.doesNotMatch(calls[1].prompt,/讨论审美/);assert.match(calls[1].prompt,/design-harness-interaction/);await page.getByRole("button",{name:"移除参考图 · 审美参考.png",exact:true}).click();assert.equal(await page.getByAltText("审美参考.png",{exact:true}).count(),0);
  });
  await check("共享提案展示影响范围，说明同步预览且原资源保持不变",async()=>{
    await prompt.fill("补充说明并加大内容间距");await send.click();await page.getByRole("button",{name:"接受修改",exact:true}).waitFor();assert.equal(await identity.isDisabled(),true);await page.locator(".proposal-impact").filter({hasText:"comfortable、compact"}).waitFor();assert.deepEqual(fs.readFileSync(documentFile),before);assert.deepEqual(fs.readFileSync(specFile),beforeSpec);await frame.getByRole("heading",{name:"专业设计提案",exact:true}).waitFor();await openPanel(page,"交互说明");await page.getByText("完整输入说明",{exact:true}).first().waitFor();await openPanel(page,"Agent");
  });
  await check("完整提案包含全部说明和场景，并反映当前调节值",async()=>{
    const slider=page.getByRole("slider",{name:"提案内容间距",exact:true});await slider.focus();await slider.press("ArrowRight");const expected=Number(await slider.inputValue());
    const next=context.waitForEvent("page");await page.getByRole("button",{name:"打开完整提案预览",exact:true}).click();const review=await next;review.setDefaultTimeout(20000);const reviewStatus=review.getByRole("button",{name:"提案预览 · 尚未写入",exact:true});await reviewStatus.hover();await review.getByRole("tooltip").getByText("提案预览 · 尚未写入",{exact:true}).waitFor();await review.getByRole("tooltip").getByText(/源文件尚未更新/).waitFor();await review.keyboard.press("Escape");await review.getByRole("tooltip").waitFor({state:"hidden"});const product=review.locator('iframe[title="产品预览 · comfortable"]').contentFrame();await product.getByRole("heading",{name:"专业设计提案",exact:true}).waitFor();assert.equal(await product.locator(".product-surface").evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue("--content-gap"))),expected);await openPanel(review,"交互说明");await review.getByText("完整输入说明",{exact:true}).first().waitFor();await review.getByRole("button",{name:"预览设置",exact:true}).click();assert.ok((await choiceOptions(review.getByRole("combobox",{name:"场景",exact:true}))).some(option=>option.value==="retry-review"));await review.close();assert.deepEqual(fs.readFileSync(documentFile),before);
  });
  await check("放弃恢复原说明，接受统一写入并恢复身份和消息记录",async()=>{
    await page.getByRole("button",{name:"放弃预览",exact:true}).click();assert.deepEqual(fs.readFileSync(documentFile),before);await openPanel(page,"交互说明");await page.getByText("输入与校验",{exact:true}).first().waitFor();await openPanel(page,"Agent");await prompt.fill("补充说明并加大内容间距");await send.click();await page.getByRole("button",{name:"接受修改",exact:true}).waitFor();await page.evaluate(()=>{window.__roleAccept=true;});await page.getByRole("button",{name:"接受修改",exact:true}).click();await page.getByRole("log").getByText("已接受",{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__roleAccept),true);await page.waitForFunction(()=>document.querySelector('[aria-label="视口"]').getAttribute("data-value")==="renamed-viewport");assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("scenario"),"renamed-initial");assert.equal(await frame.getByRole("textbox",{name:"任务主题",exact:true}).inputValue(),"用户刚输入的会话主题");assert.match(fs.readFileSync(documentFile,"utf8"),/完整输入说明/);assert.equal(JSON.parse(fs.readFileSync(path.join(root,"scenarios.json"))).at(-1).id,"retry-review");await openPanel(page,"Agent");await page.waitForFunction(()=>document.querySelector('[aria-label="设计身份"]').getAttribute("data-value")==="interaction");assert.equal(await page.getByRole("log").getByText("视觉设计 Agent",{exact:true}).count(),1);assert.equal(await page.getByRole("log").getByText("交互设计 Agent",{exact:true}).count(),3);
  });
  await check("手机专业身份、参考图入口与发送区域不横向溢出",async()=>{await page.setViewportSize({width:360,height:980});await chooseOption(identity,"visual");await page.getByLabel("参考图文件",{exact:true}).setInputFiles({name:"一份较长名称的视觉参考图片.png",mimeType:"image/png",buffer:png});await page.getByAltText("一份较长名称的视觉参考图片.png",{exact:true}).waitFor();assert.equal(await page.locator("html").evaluate(el=>el.scrollWidth<=innerWidth),true);const box=await page.getByRole("dialog",{name:"Agent",exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=360);});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({professionalRoles:"pass",checks:checks.length,model:"deterministic fixture; real screenshots, HTTP and Chrome",errors}));
}finally{await browser?.close();await service.close();fs.rmSync(temporary,{recursive:true,force:true});}
