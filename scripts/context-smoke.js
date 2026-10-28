import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {testStatus,memoryPreferences} from "../tests/helpers/codex-connection.mjs";
import {createCodexConnection} from "../workbench/src/backend/adapters/codex-connection.mjs";
import {openPanel,chooseOption} from "./browser-ui.js";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-context-browser-")),workspace=initialize(root,{example:true}).workspace;
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),"dh-context-ui-"));let release;
const status=testStatus();status.provider.name="测试 Provider · 多区域企业连接与很长的服务名称";status.models[0].name="Vision Test · Enterprise Reasoning Model With A Very Long Version Name";
const connection=createCodexConnection({inspect:async()=>structuredClone(status)});
const service=await startServer(workspace,{port:0,projectRoot:root,agentPreferences:memoryPreferences(),agentConnection:connection,agentRun:async({onObservation,prompt})=>{
  assert.doesNotMatch(prompt,/Candidate sources:|Trusted Skill documents:/);
  onObservation({kind:"usage",usage:{last:{inputTokens:12345,cachedInputTokens:0,outputTokens:987,reasoningOutputTokens:123,totalTokens:13332},total:{inputTokens:12664690,outputTokens:1974,totalTokens:12666664},modelContextWindow:200000,updatedAt:Date.now()}});
  onObservation({kind:"compaction",id:"fixture-compaction",at:Date.now()});
  await new Promise(resolve=>{release=resolve;});return {summary:"地图与用量已核对",files:[],controls:[]};
}});
let browser;
try{
  browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);
  await page.goto(service.origin+"/?id=example");await openPanel(page,"Agent");
  const provider=page.getByRole("button",{name:"Codex Provider 状态",exact:true}),popup=page.getByLabel("Codex 连接详情",{exact:true});
  await provider.click();await popup.getByText("尚未发送",{exact:true}).first().waitFor();assert.equal(await popup.locator('.provider-metrics dd[aria-label="尚未取得"]').count(),4);assert.equal(await popup.locator("details[open]").count(),0);assert.ok((await popup.boundingBox()).height<=340);
  await page.getByRole("button",{name:"关闭连接详情",exact:true}).click();
  await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("核对入口地图");await page.getByRole("button",{name:"发送",exact:true}).click();
  await provider.click();const metrics=popup.getByRole("region",{name:"当前会话用量",exact:true});
  await metrics.getByText("12,345 Token",{exact:true}).waitFor();await popup.getByText("请求中",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"取消生成",exact:true}).count(),1);
  assert.equal(await popup.locator(".provider-metrics>div").count(),4);await metrics.getByText("12.7M Token",{exact:true}).waitFor();assert.equal(await metrics.getByLabel("12,666,664 Token",{exact:true}).getAttribute("title"),"12,666,664 Token");
  const model=popup.locator('.provider-connection-fields dd[title]').filter({hasText:status.models[0].name});assert.equal(await model.getAttribute("title"),status.models[0].name);assert.ok(await model.evaluate(el=>el.scrollWidth>el.clientWidth));
  assert.ok((await popup.boundingBox()).height<=340);assert.equal(await popup.locator("details[open]").count(),0);
  await page.screenshot({path:path.join(screenshots,"provider-desktop.png")});
  for(const width of [360,320]){
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(()=>{const rect=document.querySelector('.codex-connection')?.getBoundingClientRect();return rect&&rect.x>=0&&rect.right<=innerWidth;});
    const bounds=await popup.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
    assert.ok(bounds.height<=340);const id=popup.locator(".codex-session-id code");assert.ok((await id.boundingBox()).height<24);assert.equal(await id.getAttribute("title"),await id.textContent());
    assert.equal(await popup.evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await page.locator("html").evaluate(el=>el.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(screenshots,`provider-${width}.png`)});
  }
  await popup.getByText("更多信息",{exact:true}).click();await metrics.getByText("0",{exact:true}).waitFor();await metrics.getByText("1 次",{exact:true}).waitFor();
  const hostCode=popup.locator("code[title="+JSON.stringify(fs.realpathSync(root))+"]");assert.equal(await hostCode.getAttribute("title"),fs.realpathSync(root));assert.ok((await hostCode.boundingBox()).height<24);assert.ok((await popup.boundingBox()).height<=440);
  await page.context().grantPermissions(["clipboard-read","clipboard-write"],{origin:service.origin});await popup.getByRole("button",{name:"复制宿主项目路径",exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),fs.realpathSync(root));
  await page.screenshot({path:path.join(screenshots,"provider-details-320.png")});
  release();await page.getByRole("log").getByText("地图与用量已核对",{exact:true}).waitFor();await page.reload();await openPanel(page,"Agent");await provider.click();await popup.getByText("12,345 Token",{exact:true}).waitFor();
  await page.getByRole("button",{name:"关闭连接详情",exact:true}).click();const picker=page.getByRole("combobox",{name:"Agent 会话",exact:true}),first=await picker.getAttribute("data-value");
  await page.getByRole("button",{name:"新建会话",exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="Agent 会话"]').getAttribute("data-value")!==id,first);
  await provider.click();assert.equal(await popup.getByText("12,345 Token",{exact:true}).count(),0);assert.equal(await popup.locator('.provider-metrics dd[aria-label="尚未取得"]').count(),4);assert.equal(await popup.locator("details[open]").count(),0);
  await page.getByRole("button",{name:"关闭连接详情",exact:true}).click();await chooseOption(picker,first);await provider.click();await popup.getByText("12,345 Token",{exact:true}).waitFor();
  console.log("PASS Provider 四项核心用量、折叠详情、零值与缺失数据、刷新恢复与会话隔离");console.log("PASS 桌面/360/320px 默认高度不超过340px，长模型名/ID/路径省略与完整复制");console.log("SCREENSHOTS "+screenshots);
}finally{release?.();await browser?.close();await service.close();fs.rmSync(root,{recursive:true,force:true});}
