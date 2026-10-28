import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {createCodexConnection} from "../workbench/src/backend/adapters/codex-connection.mjs";
import {testStatus,memoryPreferences} from "../tests/helpers/codex-connection.mjs";
import {openPanel,chooseOption,choiceOptions} from "./browser-ui.js";
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"dh-composer-browser-")),workspace=initialize(directory,{example:true}).workspace;
let status=testStatus(),calls=[],errors=[],checks=[],browser;
const connection=createCodexConnection({inspect:async()=>structuredClone(status)});
const service=await startServer(workspace,{agentPreferences:memoryPreferences(),port:0,agentConnection:connection,agentRun:async({prompt,model,signal})=>{
  calls.push(model);const message=JSON.parse(prompt.match(/User message: (.*)\n/)[1]);
  if(message==="等待停止")await new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true}));
  if(message==="模拟请求失败")throw new Error("测试请求失败");
  return {summary:"已采用 "+model.name,files:[],controls:[]};
}});
async function check(name,run){await run();checks.push(name);console.log("PASS "+name);}
try{
  browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage({viewport:{width:1680,height:1100}});page.setDefaultTimeout(20000);page.on("pageerror",error=>errors.push(error.message));await page.goto(service.origin+"/?id=example");await openPanel(page,"Agent");
  const identity=page.getByRole("combobox",{name:"设计身份",exact:true}),model=page.getByRole("combobox",{name:"模型",exact:true}),prompt=page.getByRole("textbox",{name:"发给 Agent",exact:true}),send=page.getByRole("button",{name:"发送",exact:true}),provider=page.getByRole("button",{name:"Codex Provider 状态",exact:true});
  await page.waitForFunction(()=>!document.querySelector('[aria-label="模型"]').disabled);await chooseOption(identity,"visual");
  await check("图标工具位于输入框底部，保留可访问名称与当前模型",async()=>{
    const textarea=await prompt.boundingBox(),toolbar=await page.getByRole("group",{name:"Agent 输入工具",exact:true}).boundingBox();assert.ok(toolbar.y>=textarea.y+textarea.height);assert.equal(await model.getAttribute("data-value"),"");assert.equal((await choiceOptions(model)).find(option=>option.value==="text-only").disabled,true);assert.equal(await page.getByRole("button",{name:"添加参考图",exact:true}).innerText(),"");await provider.click();await page.getByRole("region",{name:"Codex 连接详情",exact:true}).getByText("已认证 · ChatGPT",{exact:true}).waitFor();await page.getByRole("button",{name:"关闭连接详情",exact:true}).click();
  });
  await check("选择模型影响实际下一轮，生成期间锁定设置且图标可停止",async()=>{
    await chooseOption(model,"test-fast");await prompt.fill("等待停止");await send.click();const stop=page.getByRole("button",{name:"取消生成",exact:true});await stop.waitFor();await page.getByText("请求已提交至本机 Codex",{exact:true}).waitFor();assert.equal(await model.isDisabled(),true);assert.equal(await identity.isDisabled(),true);await stop.click();await page.getByRole("log").getByText("已取消",{exact:true}).waitFor();assert.equal(calls[0].id,"test-fast");assert.equal(calls[0].effort,"low");await provider.click();await page.getByRole("region",{name:"Codex 连接详情",exact:true}).getByText("已取消 · Fast Test",{exact:false}).waitFor();await page.getByRole("button",{name:"关闭连接详情",exact:true}).click();
  });
  await check("切换模型保留对话，历史标记各轮模型且重新加载恢复选择",async()=>{
    await chooseOption(model,"");await prompt.fill("继续当前讨论");await send.click();await page.getByRole("log").getByText("已采用 Vision Test",{exact:true}).waitFor();assert.equal(calls.at(-1).id,"test-vision");assert.equal(await page.getByRole("log").locator("article").count(),4);assert.ok(await page.locator(".message-model").filter({hasText:"Fast Test"}).count());assert.ok(await page.locator(".message-model").filter({hasText:"Vision Test"}).count());await page.reload();await openPanel(page,"Agent");await page.waitForFunction(()=>document.querySelector('[aria-label="设计身份"]').getAttribute("data-value")==="visual");await page.waitForFunction(()=>!document.querySelector('[aria-label="模型"]').disabled);assert.equal(await model.getAttribute("data-value"),"");assert.equal(await page.getByRole("log").locator("article").count(),4);
  });
  await check("会话恢复完成前不能发送或覆盖已保存模型",async()=>{
    let release;const gate=new Promise(resolve=>release=resolve),pattern="**/__dh/live/session?**";await page.route(pattern,async route=>{await gate;const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,identity:"visual",model:"test-fast"}});});const count=calls.length;await page.reload();await openPanel(page,"Agent");await prompt.fill("恢复完成前保留的草稿");assert.equal(await identity.isDisabled(),true);assert.equal(await model.isDisabled(),true);assert.equal(await send.isDisabled(),true);release();await page.waitForFunction(()=>!document.querySelector('[aria-label="模型"]').disabled);assert.equal(await prompt.inputValue(),"恢复完成前保留的草稿");assert.equal(calls.length,count);assert.equal(await model.getAttribute("data-value"),"test-fast");await page.unroute(pattern);await chooseOption(model,"");
  });
  await check("请求失败不冒充登录失效，状态刷新不产生模型调用",async()=>{
    await prompt.fill("模拟请求失败");await send.click();await page.getByRole("log").getByText("测试请求失败",{exact:true}).waitFor();await provider.click();const details=page.getByRole("region",{name:"Codex 连接详情",exact:true});await details.getByText("失败 · Vision Test",{exact:false}).waitFor();await details.getByText("已认证 · ChatGPT",{exact:true}).waitFor();const count=calls.length;await page.getByRole("button",{name:"刷新 Codex 状态",exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="刷新 Codex 状态"]').disabled);assert.equal(calls.length,count);
  });
  await check("认证缺失保留草稿并阻止发送，恢复后可使用本机默认配置",async()=>{
    status={...testStatus(),auth:"required",authMode:""};await page.getByRole("button",{name:"刷新 Codex 状态",exact:true}).click();await page.getByText("在本机 Codex 完成登录后刷新。",{exact:true}).waitFor();await prompt.fill("登录恢复前的草稿");assert.equal(await send.isDisabled(),true);status={...testStatus(),auth:"external",authMode:"",catalogAvailable:false,models:[]};await page.getByRole("button",{name:"刷新 Codex 状态",exact:true}).click();await page.getByText("由 Provider 管理",{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="模型"]').disabled);assert.equal(await prompt.inputValue(),"登录恢复前的草稿");assert.equal(await send.isEnabled(),true);await page.getByRole("button",{name:"关闭连接详情",exact:true}).click();
  });
  await check("参考图与元素附件可移除，360与320宽度工具栏不溢出",async()=>{
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nq8AAAAASUVORK5CYII=","base64");await page.getByLabel("参考图文件",{exact:true}).setInputFiles({name:"会话样式参考.png",mimeType:"image/png",buffer:png});await page.getByAltText("会话样式参考.png",{exact:true}).waitFor();await page.getByRole("button",{name:"点选元素",exact:true}).click();const frame=page.locator('iframe[title="产品预览 · comfortable"]').contentFrame();await frame.getByRole("textbox",{name:"任务主题",exact:true}).click();await page.locator(".composer-selection").waitFor();const chip=await page.locator(".composer-selection").boundingBox(),textarea=await prompt.boundingBox();assert.ok(chip.y+chip.height<=textarea.y);for(const width of [360,320]){await page.setViewportSize({width,height:980});assert.equal(await page.locator("html").evaluate(el=>el.scrollWidth<=innerWidth),true);const sendBox=await send.boundingBox();assert.ok(sendBox.x>=0&&sendBox.x+sendBox.width<=width);const tools=await page.getByRole("group",{name:"Agent 输入工具",exact:true}).boundingBox();for(const button of ["点选元素","添加参考图","Codex Provider 状态"]){const box=await page.getByRole("button",{name:button,exact:true}).boundingBox();assert.ok(box.x>=tools.x&&box.x+box.width<=tools.x+tools.width+.5);}}
    await page.getByRole("button",{name:"移除参考图 · 会话样式参考.png",exact:true}).click();await page.getByRole("button",{name:"移除元素上下文",exact:true}).click();assert.equal(await page.locator(".composer-selection").count(),0);assert.equal(await page.getByAltText("会话样式参考.png",{exact:true}).count(),0);
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({composer:"pass",checks:checks.length,requests:calls.length,pageErrors:errors}));
}finally{await browser?.close();await service.close();fs.rmSync(directory,{recursive:true,force:true});}
