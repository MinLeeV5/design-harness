// Deterministic model seam; real HTTP, persistence, Chrome and iframe interaction.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {testConnection,memoryPreferences} from "../tests/helpers/codex-connection.mjs";
import {openPanel,chooseAgentSetting,chooseOption,selectPreview} from "./browser-ui.js";
const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-exploration-browser-")),workspace=initialize(base,{example:true}).workspace,root=path.join(workspace,"requirements/example"),source=path.join(root,"candidates/comfortable/pages/task.json"),original=fs.readFileSync(source),other=fs.readFileSync(path.join(root,"candidates/compact/pages/task.json"));
const errors=[],checks=[],workerThreads=new Set();let failB=true,service,browser,page;
const text=input=>JSON.parse(input.prompt.match(/^User message: (.+)$/m)[1]);
const directions=[{title:"清晰层次",brief:"结构分组与主操作"},{title:"柔和留白",brief:"圆润表面与间距"},{title:"紧凑工作区",brief:"紧凑轮廓与边界"},{title:"辅助区域",brief:"主体配合辅助区域"}];
const run=async input=>{
  const message=text(input);
  if(message.includes("解释当前页面"))return {summary:"普通对话可以继续，未启动方案探索。",files:[],controls:[]};
  if(input.schema.properties.directions){const mode=message.includes("融合")?"fuse":message.includes("细化")?"refine":"explore";return {summary:mode==="explore"?"本轮方向和范围已明确，请确认生成。":"已明确本次取舍，保留原方案并生成结果。",directions:mode==="explore"?directions.slice(0,input.schema.properties.directions.maxItems):[{title:mode==="fuse"?"融合":"细化",brief:"保留内容与交互，融合或细化指定部分"}],files:[],controls:[],ready:true,operation:mode,base:mode==="fuse"?"a":mode==="refine"?(message.includes("B 的详情")?"b":"d"):"",pages:message.includes("B 的详情")?["task","details"]:["task"]};}
  workerThreads.add(input.session.id);const label=message.match(/独立方案 ([A-Z](?:-[A-Z])*)/)?.[1];
  if(message.includes("审批验证")){const answer=await input.onApproval({kind:"command",title:"分支检查 "+label,command:"node --version",choices:["accept","decline","cancel"]});if(answer.decision!=="accept")throw new Error("分支检查已拒绝");}
  if(label==="B"&&failB){failB=false;throw new Error("B 可单独重试");}
  const targetPage=message.includes("B 的详情")?"details":"task",targetPath="candidates/comfortable/pages/"+targetPage+".json",folder=path.join(input.directory,"requirements/example"),task=JSON.parse(fs.readFileSync(path.join(folder,targetPath)));task.elements["task-page"].props.title="可操作方案 "+label;task.elements["task-form"].props.radius=({A:8,B:20,C:4,D:20}[label]??task.elements["task-form"].props.radius);
  const files=[{path:targetPath,content:JSON.stringify(task)}];
  if(label==="B"&&targetPage==="task"&&input.prompt.startsWith("You are the 交互设计 identity")){const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"))),scenarios=JSON.parse(fs.readFileSync(path.join(folder,"scenarios.json")));if(!manifest.pages.some(item=>item.id==="details")){manifest.pages.push({id:"details",title:"方案 B 的详情"});scenarios.push({id:"details",page:"details",title:"详情状态",state:{phase:"new"}});for(const candidate of manifest.candidates){candidate.pages.details="candidates/"+candidate.id+"/pages/details.json";const spec=JSON.parse(fs.readFileSync(path.join(folder,candidate.pages.task)));spec.elements["task-page"].props.title="B 的独立详情页";files.push({path:candidate.pages.details,content:JSON.stringify(spec)});}files.push({path:"manifest.json",content:JSON.stringify(manifest)},{path:"scenarios.json",content:JSON.stringify(scenarios)},{path:"interactions/details.md",content:"---\nschemaVersion: 1\npage: details\nannotations:\n  - id: details-input\n    target: task-form\n    view: card\nsources:\n  - kind: design\n    ref: 合成浏览器验收\n---\n\n## 详情输入 {#details-input}\n只属于 B 的详情说明。\n"});}}
  return {summary:"已生成 "+label,files,controls:[{id:"rounding",label:"方案圆角",type:"range",binding:"prop",target:"task-form",property:"radius",min:4,max:28,step:2,unit:"px"}]};
};
const start=()=>startServer(workspace,{port:0,agentConnection:testConnection(),agentPreferences:memoryPreferences(),agentRun:run});
async function check(label,action){await action();checks.push(label);console.log("PASS "+label);}
async function send(message){await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill(message);await page.getByRole("button",{name:"发送",exact:true}).click();}
async function done(){await page.waitForFunction(()=>!document.querySelector(".agent-waiting")&&Boolean(document.querySelector('[aria-label="发送"]')));}
const result=()=>page.getByRole("region",{name:"设计方案",exact:true}),canvas=()=>page.getByRole("region",{name:"多方案比较",exact:true}),option=id=>canvas().locator('[data-option="'+id+'"]'),frame=id=>option(id).locator("iframe").contentFrame();
async function layout(count){
  await page.waitForFunction(count=>{
    const tiles=[...document.querySelectorAll('.exploration-option:not([hidden])')];
    return tiles.length===count&&tiles.every(tile=>{
      const frame=tile.querySelector('iframe'),column=tile.querySelector('.frame-column');
      if(!frame||!column)return false;
      const f=frame.getBoundingClientRect(),c=column.getBoundingClientRect();
      return f.width>0&&f.height>0&&f.left>=c.left-1&&f.right<=c.right+1&&f.top>=c.top-1&&f.bottom<=c.bottom+1;
    });
  },count);
  const metrics=await canvas().evaluate(root=>{
    const grid=root.querySelector('.exploration-grid'),rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {canvas:rect(root),grid:rect(grid),scrollWidth:grid.scrollWidth,clientWidth:grid.clientWidth,tiles:[...grid.querySelectorAll('.exploration-option:not([hidden])')].map(el=>({...rect(el),viewport:{width:el.querySelector('iframe').clientWidth,height:el.querySelector('iframe').clientHeight}}))};
  });
  assert.equal(metrics.tiles.length,count);
  assert.ok(Math.abs(metrics.grid.width-metrics.canvas.width)<2,'平铺使用完整画布宽度');
  assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,'比较网格不出现横向滚动');
  const g=metrics.grid;
  for(const [i,tile] of metrics.tiles.entries()){
    assert.ok(tile.x>=g.x-1&&tile.y>=g.y-1&&tile.x+tile.width<=g.x+g.width+1&&tile.y+tile.height<=g.y+g.height+1,'方案完整位于画布中');
    for(const other of metrics.tiles.slice(i+1))assert.ok(Math.min(tile.x+tile.width,other.x+other.width)-Math.max(tile.x,other.x)<1||Math.min(tile.y+tile.height,other.y+other.height)-Math.max(tile.y,other.y)<1,'方案之间没有重叠');
  }
  assert.ok(metrics.tiles.reduce((area,tile)=>area+tile.width*tile.height,0)/(g.width*g.height)>.88,'方案平铺填满可用空间');
  if(count===4){assert.equal(new Set(metrics.tiles.map(tile=>Math.round(tile.x))).size,2,'四方案分成两列');assert.equal(new Set(metrics.tiles.map(tile=>Math.round(tile.y))).size,2,'四方案分成两行');}
  assert.ok(await page.locator('html').evaluate(el=>el.scrollWidth<=innerWidth),'页面无横向溢出');
  return metrics;
}
async function screenshot(name){if(process.env.DH_EXPLORATION_SCREENSHOTS){fs.mkdirSync(process.env.DH_EXPLORATION_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.DH_EXPLORATION_SCREENSHOTS,name+'.png')});}}
try{
  service=await start();browser=await chromium.launch({channel:"chrome",headless:true});page=await browser.newPage({viewport:{width:1680,height:1100}});page.setDefaultTimeout(30000);page.on("pageerror",error=>errors.push(error.message));await page.goto(service.origin+"/?id=example");await openPanel(page,"Agent");await page.waitForFunction(()=>!document.querySelector('[data-agent-model-settings]').disabled);
  await check("交互身份共用底部数量，讨论后显式确认才启动独立方案",async()=>{
    assert.equal(await page.getByRole("combobox",{name:"方案数量",exact:true}).getAttribute("data-value"),"1");await chooseOption(page.getByRole("combobox",{name:"方案数量",exact:true}),"3");await page.getByRole("button",{name:"发送",exact:true}).click();await result().getByRole("button",{name:"确认生成 3 个方案",exact:true}).waitFor();assert.equal(workerThreads.size,0);assert.equal(await canvas().count(),0);await result().getByRole("button",{name:"确认生成 3 个方案",exact:true}).click();await result().getByRole("button",{name:"重试方案 B",exact:true}).waitFor();
    // A failed branch retries against its frozen baseline even if the visible frame cannot be captured.
    await page.evaluate(()=>{window.__blockRetryCapture=event=>{if(event.data?.type==="dh:capture-result")event.stopImmediatePropagation();};window.addEventListener("message",window.__blockRetryCapture,true);});
    await result().getByRole("button",{name:"重试方案 B",exact:true}).click();await frame("b").getByRole("heading",{name:"可操作方案 B",exact:true}).waitFor();
    await page.evaluate(()=>{window.removeEventListener("message",window.__blockRetryCapture,true);delete window.__blockRetryCapture;});assert.ok(await page.getByRole("textbox",{name:"发给 Agent",exact:true}).isVisible());assert.deepEqual(fs.readFileSync(source),original);assert.equal(workerThreads.size,4);
  });
  await check("多方案探索禁用新增批阅，悬停说明原因且不会进入落针",async()=>{
    await openPanel(page,"评审");const add=page.getByRole("button",{name:"添加批阅",exact:true});assert.equal(await add.isDisabled(),true);const trigger=page.locator(".review-pick-disabled");await trigger.hover();await page.getByRole("tooltip").filter({hasText:"方案对比期间暂不支持新增批阅"}).waitFor();await trigger.click();assert.equal(await page.locator(".pick-notice").count(),0);assert.equal(await canvas().locator("[data-option]").count(),3);await openPanel(page,"Agent");
  });
  await check("主画布独立交互、放大和返回总览，Agent 抽屉保持可用",async()=>{
    await frame("a").getByRole("textbox",{name:"任务主题",exact:true}).fill("仅属于 A");assert.notEqual(await frame("b").getByRole("textbox",{name:"任务主题",exact:true}).inputValue(),"仅属于 A");await layout(3);const openBounds=await canvas().locator(".exploration-grid").boundingBox();await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();assert.deepEqual(await canvas().locator(".exploration-grid").boundingBox(),openBounds,"浮动抽屉不占据画布空间");await page.evaluate(()=>{window.__tilingFrames=[...document.querySelectorAll(".exploration-option iframe")];});for(const viewport of [{width:900,height:1400},{width:2560,height:800},{width:360,height:980},{width:1680,height:1100}]){await page.setViewportSize(viewport);await layout(3);assert.equal(await page.evaluate(()=>[...document.querySelectorAll(".exploration-option iframe")].every((frame,i)=>frame===window.__tilingFrames[i])),true,"重排不重建 iframe");assert.equal(await frame("a").getByRole("textbox",{name:"任务主题",exact:true}).inputValue(),"仅属于 A");}await screenshot("three-options");await option("a").getByRole("button",{name:"放大查看",exact:true}).click();await layout(1);await openPanel(page,"Agent");await result().getByRole("button",{name:"使用方案 B",exact:true}).click();await option("b").waitFor({state:"visible"});assert.equal(await option("a").isVisible(),false);await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();await canvas().getByRole("button",{name:"查看全部方案",exact:true}).click();await layout(3);assert.equal(await frame("a").getByRole("textbox",{name:"任务主题",exact:true}).inputValue(),"仅属于 A");await openPanel(page,"Agent");assert.equal(await page.getByRole("combobox",{name:"方案数量",exact:true}).getAttribute("data-value"),"3");
  });
  await check("不同方案页面独立，新增页导航、说明和细化控件同步",async()=>{
    await result().getByRole("button",{name:/^(使用|当前)方案 B$/}).click();await chooseOption(option("b").getByRole("combobox",{name:"B 的页面",exact:true}),"details");await frame("b").getByRole("heading",{name:"B 的独立详情页",exact:true}).waitFor();assert.equal(await page.getByRole("combobox",{name:"页面",exact:true}).getAttribute("data-value"),"details");assert.equal(await option("a").getByRole("combobox",{name:"A 的页面",exact:true}).getAttribute("data-value"),"task");await openPanel(page,"交互说明");await page.getByText("只属于 B 的详情说明。",{exact:true}).waitFor();await openPanel(page,"Agent");await send("细化 B 的详情标题");await done();await frame("b").getByRole("heading",{name:"可操作方案 B",exact:true}).waitFor();await page.getByRole("slider",{name:"方案圆角",exact:true}).waitFor();await chooseOption(option("b").getByRole("combobox",{name:"B 的页面",exact:true}),"task");await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').dataset.value==="task");
  });
  await check("跨方案点选进入同一草稿，发送后融合生成 D 并保留 A/B/C",async()=>{
    for(const id of ["a","b"]){await page.getByRole("button",{name:"点选元素",exact:true}).click();await option(id).scrollIntoViewIfNeeded();const target=frame(id).getByRole("heading",{name:"可操作方案 "+id.toUpperCase(),exact:true}),inner=await target.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}),host=option(id).locator("iframe"),outer=await host.boundingBox(),size=await host.evaluate(el=>({width:el.clientWidth,height:el.clientHeight}));const x=outer.x+inner.x*outer.width/size.width,y=outer.y+inner.y*outer.height/size.height;await page.mouse.move(x,y);await frame(id).locator("#dh-review-outline").waitFor({state:"visible"});await page.mouse.click(x,y);await page.getByLabel("方案引用",{exact:true}).waitFor();}
    assert.equal(await page.locator(".option-draft-card").count(),2);assert.equal(await page.getByRole("textbox",{name:"发给 Agent",exact:true}).inputValue(),"");await send("融合 A 的结构与 B 的圆角");await result().getByRole("button",{name:"当前方案 D",exact:true}).waitFor();await frame("d").getByRole("heading",{name:"可操作方案 D",exact:true}).waitFor();assert.equal(await canvas().locator("[data-option]").count(),4);assert.equal(await page.locator(".option-draft-card").count(),0);assert.equal(await page.getByRole("combobox",{name:"方案数量",exact:true}).getAttribute("data-value"),"3");assert.deepEqual(fs.readFileSync(source),original);
  });
  await check("四方案自适应四宫格，浮动抽屉开关不改变平铺与原始分辨率",async()=>{
    const before=await layout(4);await screenshot("four-options-drawer");await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();assert.deepEqual(await layout(4),before,'关闭抽屉不移动或缩放方案');
    for(const viewport of [{width:1680,height:1100},{width:1440,height:900},{width:1200,height:600},{width:768,height:1024},{width:360,height:980},{width:320,height:640}]){
      await page.setViewportSize(viewport);const current=await layout(4);assert.deepEqual(current.tiles.map(tile=>tile.viewport),before.tiles.map(tile=>tile.viewport),'窗口改变只缩放预览，不改变产品分辨率');
      if(viewport.width===1680)await screenshot("four-options");if(viewport.width===320)await screenshot("four-options-narrow");
    }
    await page.setViewportSize({width:1680,height:1100});await openPanel(page,"Agent");await layout(4);
  });
  await check("切身份细化只更新 D 的版本，数量用于下轮探索",async()=>{
    await chooseAgentSetting(page,"identity","visual");await send("细化 D 的标题");await result().getByRole("combobox",{name:"D 的版本",exact:true}).waitFor();await done();assert.equal(await canvas().locator("[data-option]").count(),4);await chooseOption(page.getByRole("combobox",{name:"方案数量",exact:true}),"2");await result().getByRole("button",{name:"基于当前方案再探索 · 2 个方案",exact:true}).click();await result().getByRole("button",{name:"确认生成 2 个方案",exact:true}).waitFor();await layout(1);await result().getByRole("button",{name:"确认生成 2 个方案",exact:true}).click();await frame("b").getByRole("heading",{name:"可操作方案 D-B",exact:true}).waitFor();assert.equal(await canvas().locator("[data-option]").count(),2);await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();for(const viewport of [{width:1680,height:1100},{width:768,height:1200},{width:360,height:980}]){await page.setViewportSize(viewport);await layout(2);}await page.setViewportSize({width:1680,height:1100});await layout(2);await screenshot("two-options");await openPanel(page,"Agent");
  });
  await check("刷新及服务重启可从轮次历史恢复，接受只写所选方案",async()=>{
    await page.reload();await openPanel(page,"Agent");await frame("b").getByRole("heading",{name:"可操作方案 D-B",exact:true}).waitFor();await service.close();service=await start();await page.goto(service.origin+"/?id=example");await openPanel(page,"Agent");if(!await result().locator(".exploration-history").evaluate(el=>el.open))await result().locator(".exploration-history>summary").click();await result().getByRole("button",{name:"打开第 1 轮",exact:true}).click();await frame("d").getByRole("heading",{name:"可操作方案 D",exact:true}).waitFor();await result().getByRole("button",{name:/^(使用|当前)方案 D$/}).click();const slider=page.getByRole("slider",{name:"方案圆角",exact:true});await slider.focus();await slider.press("ArrowRight");assert.equal(await slider.inputValue(),"22");await page.getByRole("button",{name:"接受修改",exact:true}).click();await canvas().waitFor({state:"hidden"});assert.equal(JSON.parse(fs.readFileSync(source)).elements["task-form"].props.radius,22);assert.deepEqual(fs.readFileSync(path.join(root,"candidates/compact/pages/task.json")),other);assert.ok(await result().isVisible());
  });
  await check("历史可显式删除，窄屏工具与数量选择无溢出",async()=>{
    if(!await result().locator(".exploration-history").evaluate(el=>el.open))await result().locator(".exploration-history>summary").click();const history=result().locator(".exploration-history");await history.getByRole("button",{name:"删除此轮",exact:true}).first().click();await history.getByRole("button",{name:"确认删除",exact:true}).click();await history.locator("ul>li").nth(1).waitFor({state:"detached"});await history.getByRole("button",{name:"打开第 1 轮",exact:true}).waitFor();assert.equal(await history.locator("ul>li").count(),1);
    for(const width of [360,320]){await page.setViewportSize({width,height:980});assert.ok(await page.locator("html").evaluate(el=>el.scrollWidth<=innerWidth));for(const name of ["点选元素","添加参考图","模型","发送"]){const box=await page.getByRole("button",{name,exact:true}).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width,name);}const box=await page.getByRole("combobox",{name:"方案数量",exact:true}).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width);}
  });
  await check("保留多方案数量时切换权限，普通对话仍可发送",async()=>{
    await chooseOption(page.getByRole("combobox",{name:"方案数量",exact:true}),"3");for(const permission of ["read-only","full-access"]){await chooseAgentSetting(page,"permission",permission);assert.ok(await page.getByRole("combobox",{name:"方案数量",exact:true}).isDisabled());await send("解释当前页面");await done();await page.locator(".agent-message.assistant").last().getByText("普通对话可以继续，未启动方案探索。",{exact:true}).waitFor();assert.equal(await canvas().count(),0);}await chooseAgentSetting(page,"permission","proposal");assert.equal(await page.getByRole("combobox",{name:"方案数量",exact:true}).getAttribute("data-value"),"3");
  });
  await check("三路审批在刷新后仍归属原会话，可分别处理",async()=>{
    await page.setViewportSize({width:1680,height:1100});await send("给我三个视觉方案，审批验证");await result().getByRole("button",{name:"确认生成 3 个方案",exact:true}).waitFor();await result().getByRole("button",{name:"确认生成 3 个方案",exact:true}).click();await page.getByRole("button",{name:"批准本次",exact:true}).first().waitFor();await page.reload();await openPanel(page,"Agent");for(let index=0;index<3;index++){await page.getByRole("button",{name:"批准本次",exact:true}).first().click();}for(const id of ["a","b","c"])await frame(id).getByRole("heading",{name:"可操作方案 "+id.toUpperCase(),exact:true}).waitFor();
  });
  if(process.env.DH_EXPLORATION_SCREENSHOTS){fs.mkdirSync(process.env.DH_EXPLORATION_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.DH_EXPLORATION_SCREENSHOTS,"comparison.png")});}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({agentExploration:"deterministic model; real HTTP/Chrome; restart persistence",passed:checks.length,errors}));
}catch(error){if(page){console.error(await page.locator('.validation-warning').allTextContents());if(process.env.DH_EXPLORATION_SCREENSHOTS){fs.mkdirSync(process.env.DH_EXPLORATION_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.DH_EXPLORATION_SCREENSHOTS,"failure.png")});}}throw error;}
finally{await browser?.close();await service?.close();fs.rmSync(base,{recursive:true,force:true});}
