import {testConnection,memoryPreferences} from "../tests/helpers/codex-connection.mjs";
import {selectPreview,previewField,openPanel,clickTool,chooseOption,choiceOptions,chooseAgentSetting} from "./browser-ui.js";
// Synthetic navigation and document acceptance; no business service or retained evidence.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright";
import {initialize,cloneCandidate} from "../workbench/src/backend/services/workspace.mjs";
import {exportToFile} from "../workbench/src/backend/services/export.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-navigation-check-"));
let browser,service;
const source=`import {createContext,useContext,useState,useRef} from "react";
import {useStateStore} from "@json-render/react";
import {defineCatalog} from "@json-render/core";
import {schema} from "@json-render/react/schema";
import {defineRegistry} from "@json-render/react";
import {usePreviewNavigation,usePreviewState} from "@design-harness/preview";
import {z} from "zod";
const SessionContext=createContext(null);
export const catalog=defineCatalog(schema,{components:{Session:{props:z.object({}),slots:["default"]},Form:{props:z.object({})},Summary:{props:z.object({})}},actions:{}});
function Session({children}){
 const {state,set}=useStateStore(),page=String(state.route),[note,setNote]=useState(""),[dirty,setDirty]=useState(false),[pending,setPending]=useState(""),guard=useRef(null);
 const beforeNavigate=(next,signal)=>{if(!dirty)return true;return new Promise(resolve=>{const finish=allowed=>{signal.removeEventListener("abort",abort);if(guard.current===finish){guard.current=null;setPending("");}resolve(allowed);};const abort=()=>finish(false);guard.current=finish;signal.addEventListener("abort",abort,{once:true});setPending(next);});};
 const navigate=usePreviewNavigation({page,navigate:next=>{if(next!==page&&dirty){setNote("");setDirty(false);}set("/route",next);},beforeNavigate,state:{dirty}});
 return <SessionContext.Provider value={{note,setNote,setDirty,navigate}}><main><h1>导航协议示例</h1>{children}{pending&&<section role="dialog" aria-label="离开保护"><p>当前输入尚未保存</p><button onClick={()=>guard.current?.(false)}>继续编辑</button><button onClick={()=>guard.current?.(true)}>放弃并离开</button></section>}</main></SessionContext.Provider>;
}
function Form(){const p=useContext(SessionContext),{state,set}=useStateStore();return <section><label>输入内容<input aria-label="输入内容" value={p.note} onChange={e=>{p.setNote(e.target.value);p.setDirty(true);}}/></label><button onClick={()=>p.setDirty(false)}>保存输入</button><button onClick={()=>p.navigate("summary")}>打开摘要</button><button onClick={()=>set("/phase","complete")}>完成处理</button><p>{String(state.phase)}</p><button data-dh-part="secret" style={{visibility:"hidden"}}>隐藏目标</button></section>;}
function Summary(){const p=useContext(SessionContext);return <section><h2>已保存摘要</h2><p>{p.note}</p><button onClick={()=>p.navigate("form")}>返回输入</button></section>;}
export const {registry}=defineRegistry(catalog,{components:{Session,Form,Summary},actions:{}});`;
const docs=`---
schemaVersion: 1
page: form
annotations:
  - id: input-note
    target: body
    view: card
    when:
      /phase: new
  - id: input-steps
    target: body
    view: steps
    when:
      /phase: new
  - id: input-complete
    target: body
    view: states
    when:
      /phase: complete
  - id: input-hidden
    target: body/secret
    when:
      /phase: new
  - id: input-dimensions
    target: body
    view: dimensions
    when:
      /phase: new
  - id: input-flow
    target: body
    view: dimensions
    when:
      /phase: new
  - id: input-minimal
    target: body
    view: dimensions
    when:
      /phase: new
---

## 填写内容 {#input-note}

输入会保留在当前会话。

### 异常
未保存离开需确认。

## 保存后继续 {#input-steps}

先保存，再查看摘要。

### 保存
点击保存输入。

### 导航
点击打开摘要。

## 隐藏的操作 {#input-hidden}

当前不可用，不应显示气泡。

## 处理已完成 {#input-complete}

本次输入仍保留。

### 已完成
可以继续查看摘要。

## 保存与恢复 {#input-dimensions}

### 条件
修改内容后，未保存离开需确认。

### 状态
- 未保存：继续编辑保留输入。
- 已保存：可直接查看摘要。

### 异常
取消离开时保留原页与输入，可继续编辑后再次保存。

## 查看摘要 {#input-flow}

### 操作
保存后进入摘要页，返回时保留本次会话。

### 流程
1. 填写内容。
2. 保存输入。
3. 打开摘要。

## 离开条件 {#input-minimal}

### 条件
仅有未保存输入时需要离开确认。
`;
try{
  const workspace=initialize(base,{example:true}).workspace,folder=path.join(workspace,"requirements/example"),manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json")));
  manifest.pages=[{id:"form",title:"输入页"},{id:"summary",title:"摘要页"}];manifest.controls=[];
  for(const candidate of manifest.candidates){fs.writeFileSync(path.join(folder,candidate.registry),source);candidate.pages={};for(const page of ["form","summary"]){const spec={root:"session",elements:{session:{type:"Session",props:{},children:["body"]},body:{type:page==="form"?"Form":"Summary",props:{},children:[]}},state:{route:page,phase:"new"}},relative=`candidates/${candidate.id}/pages/${page}.json`;fs.writeFileSync(path.join(folder,relative),JSON.stringify(spec));candidate.pages[page]=relative;}}
  fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest));fs.writeFileSync(path.join(folder,"scenarios.json"),JSON.stringify(manifest.pages.map(p=>({id:p.id,page:p.id,title:p.title,state:{route:p.id}}))));
  fs.rmSync(path.join(folder,"interactions"),{recursive:true});fs.mkdirSync(path.join(folder,"interactions"));fs.writeFileSync(path.join(folder,"interactions/form.md"),docs);fs.writeFileSync(path.join(folder,"interactions/summary.md"),'---\nschemaVersion: 1\npage: summary\nannotations:\n  - id: read-summary\n    target: body\n    view: rules\n---\n\n## 阅读摘要 {#read-summary}\n\n查看本次输入。\n\n### 保留规则\n返回输入页仍保留内容。\n');
  service=await startServer(workspace,{agentPreferences:memoryPreferences(),agentConnection:testConnection(),port:0});browser=await chromium.launch({channel:"chrome",headless:true});
  let page=await browser.newPage({viewport:{width:1680,height:1200}}),errors=[];page.setDefaultTimeout(10000);page.on("pageerror",error=>errors.push(error.message));
  async function checkDimensions(){
    const combined=page.locator("#input-dimensions"),flow=page.locator("#input-flow"),minimal=page.locator("#input-minimal");
    await combined.waitFor();
    assert.deepEqual(await combined.locator("dt").allTextContents(),["条件","状态","异常"]);
    assert.equal(await combined.locator(":scope > .interaction-rich").count(),0,"没有导语时不增加摘要区域");
    assert.equal(await combined.locator('details:not(.interaction-sources)').count(),0,"所选维度直接显示");
    assert.equal(await combined.locator('[data-interaction-dimension="state"] li').count(),2);
    assert.deepEqual(await flow.locator("dt").allTextContents(),["操作","流程"]);
    assert.equal(await flow.locator('[data-interaction-dimension="flow"] ol > li').count(),3);
    assert.deepEqual(await minimal.locator("dt").allTextContents(),["条件"],"单维度说明没有空项");
    const viewport=page.viewportSize(),screenshots=process.env.DH_INTERACTION_SCREENSHOTS;
    try{
      for(const width of [1680,360,320]){
        await page.setViewportSize({width,height:1200});await combined.scrollIntoViewIfNeeded();
        const bounds=await combined.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,"维度卡片位于视口内："+width);
        const rows=await page.locator(".interaction-dimension").evaluateAll(nodes=>nodes.map(node=>({layout:getComputedStyle(node).display,width:node.clientWidth,contentWidth:node.scrollWidth,label:node.querySelector("dt").getBoundingClientRect().width,body:node.querySelector("dd").getBoundingClientRect().width})));
        assert.ok(rows.every(row=>row.layout==="grid"&&row.label>0&&row.body>0&&row.contentWidth<=row.width+1),"维度样式已加载且内容无溢出："+width);
        if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await combined.screenshot({path:path.join(screenshots,(page.url().startsWith("file:")?"offline":"local")+"-"+width+".png")});}
      }
    }finally{await page.setViewportSize(viewport);}
  }
  async function exercise(url){
    await page.goto(url);const owner=page.locator('iframe[title="产品预览 · comfortable"]'),frame=owner.contentFrame();await frame.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();
    const header=page.locator('.studio-header');assert.equal(await header.locator('[aria-label="页面"]').getAttribute('data-value'),'form');assert.equal(await header.locator('[aria-label="场景"]').getAttribute('data-value'),'form');assert.equal(await page.locator('#studio-settings').isVisible(),false);
    async function click(target){await target.scrollIntoViewIfNeeded();const local=await target.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};}),b=await owner.boundingBox();await page.mouse.click(b.x+local.x*b.width/local.w,b.y+local.y*b.height/local.h);}
    await openPanel(page,"交互说明");await page.locator("#input-note").waitFor();assert.equal(await page.locator("#input-hidden button").isDisabled(),true);assert.equal(await frame.getByRole("button",{name:/隐藏的操作/}).count(),0);assert.equal(await page.locator(".interaction-steps>li").count(),2);await checkDimensions();await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();
    await frame.getByRole("textbox",{name:"输入内容",exact:true}).fill("跨页保留内容");await selectPreview(page,"页面","summary");await frame.getByRole("dialog",{name:"离开保护"}).waitFor();assert.equal(await previewField(page,"页面").getAttribute("data-value"),"form");await click(frame.getByRole("button",{name:"继续编辑",exact:true}));
    await click(frame.getByRole("button",{name:"保存输入",exact:true}));await click(frame.getByRole("button",{name:"打开摘要",exact:true}));await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="summary");await frame.getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();await frame.getByText("跨页保留内容",{exact:true}).waitFor();
    assert.equal(await header.locator('[aria-label="页面"]').innerText(),'摘要页');assert.equal(await header.locator('[aria-label="场景"]').innerText(),'当前交互状态');assert.deepEqual((await choiceOptions(previewField(page,'场景'))).map(option=>option.value),['','summary']);assert.equal(await page.locator('#studio-settings').isVisible(),false,'切换页面和检查场景均无需打开设置');
    await openPanel(page,"交互说明");await page.locator("#read-summary .interaction-table").waitFor();await page.waitForFunction(()=>!document.querySelector("#read-summary button").disabled);assert.equal(await page.locator("#input-note").count(),0);await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();
    await selectPreview(page,"页面","form");await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="form");assert.equal(await frame.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"跨页保留内容");await click(frame.getByRole("button",{name:"完成处理",exact:true}));
    await openPanel(page,"交互说明");await page.locator("#input-complete .interaction-states").waitFor();assert.equal(await page.locator("#input-note").count(),0);await frame.getByRole("button",{name:"③ 处理已完成",exact:true}).waitFor();await page.getByRole("button",{name:"阅读完整需求",exact:true}).click();await page.locator("#read-summary").waitFor();await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();
    await clickTool(page,"重置当前场景");assert.equal(await frame.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"");assert.deepEqual(errors,[]);
    await frame.getByRole("textbox",{name:"输入内容",exact:true}).fill("取消后不跨候选导航");await selectPreview(page,"页面","summary");await frame.getByRole("dialog",{name:"离开保护"}).waitFor();await click(frame.getByRole("button",{name:"继续编辑",exact:true}));await click(frame.getByRole("button",{name:"保存输入",exact:true}));await selectPreview(page,"方案","compact");await page.locator('iframe[title="产品预览 · compact"]').contentFrame().getByRole("textbox",{name:"输入内容",exact:true}).waitFor();assert.equal(await previewField(page,"页面").getAttribute("data-value"),"form");await selectPreview(page,"方案","comfortable");await frame.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();

  }
  async function exerciseComparison(){
    const owner=id=>page.locator('iframe[title="产品预览 · '+id+'"]'),frame=id=>owner(id).contentFrame();
    const first=frame("comfortable"),second=frame("compact"),pageSelect=previewField(page,"页面"),candidateSelect=previewField(page,"方案");
    async function clickIn(id,target){await target.scrollIntoViewIfNeeded();const r=await target.evaluate(el=>{const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,w:innerWidth,h:innerHeight};}),box=await owner(id).boundingBox();await page.mouse.click(box.x+r.x*box.width/r.w,box.y+r.y*box.height/r.h);}
    await clickTool(page,"重置当前场景");
    await clickTool(page,"对比方案");
    await first.getByRole("textbox",{name:"输入内容",exact:true}).fill("左侧草稿");await second.getByRole("textbox",{name:"输入内容",exact:true}).fill("右侧草稿");
    const positions=await page.locator(".frame-column:not([hidden])").evaluateAll(nodes=>nodes.map(n=>n.dataset.candidate));
    const tokens={};for(const id of positions)tokens[id]=await frame(id).locator("main").evaluate(el=>el.dataset.sessionToken=crypto.randomUUID());
    for(const id of ["compact","comfortable","compact"]){await selectPreview(page,"方案",id);assert.deepEqual(await page.locator(".frame-column:not([hidden])").evaluateAll(nodes=>nodes.map(n=>n.dataset.candidate)),positions);for(const cid of positions)assert.equal(await frame(cid).locator("main").getAttribute("data-session-token"),tokens[cid]);}
    assert.equal(await first.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"左侧草稿");assert.equal(await second.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"右侧草稿");
    // Approval on one side must not discard anything until both sides approve.
    await selectPreview(page,"页面","summary");await first.getByRole("dialog",{name:"离开保护"}).waitFor();await second.getByRole("dialog",{name:"离开保护"}).waitFor();
    await clickIn("comfortable",first.getByRole("button",{name:"放弃并离开",exact:true}));await page.locator('[data-candidate="comfortable"] .frame-clip[inert]').waitFor();await page.keyboard.type("不应进入已确认方案");if(!page.url().startsWith("file:")){await openPanel(page,"Agent");await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("待决时不得生成");assert.equal(await page.getByRole("button",{name:"发送",exact:true}).isDisabled(),true);await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();}assert.equal(await pageSelect.getAttribute("data-value"),"form");assert.equal(await first.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"左侧草稿");
    await clickIn("compact",second.getByRole("button",{name:"继续编辑",exact:true}));await page.getByRole("status").filter({hasText:"已取消切换"}).waitFor();assert.equal(await page.locator(".frame-clip[inert]").count(),0);
    assert.equal(await first.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"左侧草稿");assert.equal(await second.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"右侧草稿");
    // An in-product navigation on either side goes through the same coordinator.
    await clickIn("comfortable",first.getByRole("button",{name:"打开摘要",exact:true}));await first.getByRole("dialog",{name:"离开保护"}).waitFor();await second.getByRole("dialog",{name:"离开保护"}).waitFor();
    await clickIn("compact",second.getByRole("button",{name:"放弃并离开",exact:true}));await clickIn("comfortable",first.getByRole("button",{name:"放弃并离开",exact:true}));
    await first.getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();await second.getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();assert.equal(await pageSelect.getAttribute("data-value"),"summary");
    await clickIn("compact",second.getByRole("button",{name:"返回输入",exact:true}));await first.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();await second.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="form");
    await first.getByRole("textbox",{name:"输入内容",exact:true}).fill("左侧保留");await second.getByRole("textbox",{name:"输入内容",exact:true}).fill("右侧保留");await clickIn("comfortable",first.getByRole("button",{name:"保存输入",exact:true}));await clickIn("compact",second.getByRole("button",{name:"保存输入",exact:true}));
    await clickIn("comfortable",first.getByRole("button",{name:"完成处理",exact:true}));await selectPreview(page,"方案","comfortable");await openPanel(page,"交互说明");await page.locator("#input-complete").waitFor();await page.locator("#input-complete button").click();
    for(const id of positions)await frame(id).locator('[id$="outline"]').waitFor({state:"visible"});
    await selectPreview(page,"方案","compact");await page.locator("#input-note").waitFor();assert.equal(await page.locator("#input-complete").count(),0,"业务状态不会复制到另一候选");await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();
    await selectPreview(page,"视口","mobile");for(const id of positions)assert.equal(await owner(id).evaluate(el=>el.style.width),"390px");
    await clickTool(page,"对比方案");await selectPreview(page,"方案","comfortable");assert.equal(await first.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"左侧保留");await clickTool(page,"对比方案");assert.equal(await second.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"右侧保留");
    await clickTool(page,"重置当前场景");for(const id of positions)assert.equal(await frame(id).getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"");
    await selectPreview(page,"页面","summary");await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="summary");await selectPreview(page,"场景","summary");for(const id of positions)await frame(id).getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();
    await selectPreview(page,"场景","summary");await selectPreview(page,"页面","form");await first.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();await second.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();
    await clickTool(page,"对比方案");await selectPreview(page,"视口","desktop");await selectPreview(page,"场景","form");await selectPreview(page,"方案","comfortable");
  }
  await exercise(service.origin+"/?id=example");
  await exerciseComparison();
  await clickTool(page,"对比方案");await selectPreview(page,"方案","compact");await openPanel(page,"交互说明");await page.waitForFunction(()=>document.querySelector("#input-note button")?.disabled===false);
  await page.locator('iframe[title="产品预览 · comfortable"]').contentFrame().getByRole("button",{name:"① 填写内容",exact:true}).evaluate(el=>el.click());await page.waitForFunction(()=>document.querySelector('[aria-label="方案"]').getAttribute("data-value")==="comfortable");await page.waitForFunction(()=>document.querySelector("#input-note button")?.disabled===false);await page.getByRole("button",{name:"关闭辅助面板",exact:true}).click();await clickTool(page,"对比方案");
  // A proposal replaces the document; its initial state must come from the live page.
  await selectPreview(page,"页面","summary");await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="summary");
  const payload=await page.evaluate(()=>window.__DH_DATA__),job="77777777777777777777777777777777";let cancellations=0,fixtureSession="",fixtureJob;
  const proposal={summary:"跨页预览夹具",html:payload.previews.comfortable+"<!--proposal-->",spec:payload.specs["comfortable:summary"],css:payload.params.comfortable.css,changes:[],candidate:"comfortable",page:"summary"};
  await page.route("**/__dh/live/events",route=>{const body=route.request().postDataJSON();if(body.type==="cancel")cancellations++;fixtureSession=body.sessionId;fixtureJob={id:job,sessionId:fixtureSession,providerId:"codex",candidate:"comfortable",page:"summary",state:["generate","message"].includes(body.type)?"ready":body.type==="discard"?"discarded":"cancelled",proposal:["generate","message"].includes(body.type)?proposal:undefined};return route.fulfill({json:{...fixtureJob,...(fixtureJob.state==="ready"?{state:"running",proposal:undefined}:{})}});});
  await page.route("**/__dh/live/session?**",async route=>{const response=await route.fetch(),snapshot=await response.json();await route.fulfill({response,json:snapshot.id===fixtureSession?{...snapshot,job:fixtureJob}:snapshot});});
  await openPanel(page,"Agent");await chooseAgentSetting(page,"identity","visual");await page.getByRole("textbox",{name:"发给 Agent",exact:true}).fill("保持当前页面的预览");await page.getByRole("button",{name:"发送",exact:true}).click();await page.getByRole("button",{name:"接受修改",exact:true}).waitFor();await page.locator('iframe[title="产品预览 · comfortable"]').contentFrame().getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();assert.equal(await previewField(page,"页面").getAttribute("data-value"),"summary");assert.equal(cancellations,0);assert.equal(await previewField(page,"页面").isDisabled(),false);
  await page.locator('iframe[title="产品预览 · comfortable"]').contentFrame().getByRole("button",{name:"返回输入",exact:true}).evaluate(el=>el.click());await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="form");await page.locator('.agent-result').getByText(/当前画布未展示此提案/).waitFor();assert.equal(cancellations,0);await selectPreview(page,"页面","summary");await page.locator('iframe[title="产品预览 · comfortable"]').contentFrame().getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();assert.equal(fixtureJob.state,"ready");
  await page.getByRole("button",{name:"放弃预览",exact:true}).click();await page.getByRole("button",{name:"接受修改",exact:true}).waitFor({state:"hidden"});await page.locator('iframe[title="产品预览 · comfortable"]').contentFrame().getByRole("heading",{name:"已保存摘要",exact:true}).waitFor();assert.equal(await previewField(page,"页面").getAttribute("data-value"),"summary");
  const output=path.join(base,"offline.html");await exportToFile(workspace,"example",output);await page.close();const offlineContext=await browser.newContext({offline:true,viewport:{width:1680,height:1200}});page=await offlineContext.newPage();page.setDefaultTimeout(10000);page.on("pageerror",error=>errors.push(error.message));const requests=[];page.on("request",request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});await exercise(pathToFileURL(output).href);await exerciseComparison();assert.deepEqual(requests,[]);
  // A third candidate replaces only the current comparison slot; the counterpart stays put.
  cloneCandidate(workspace,"example","comfortable","third");
  await page.close();page=await browser.newPage({viewport:{width:1680,height:1200}});page.setDefaultTimeout(10000);await page.goto(service.origin+"/?id=example");await page.locator('iframe[title="产品预览 · comfortable"]').contentFrame().getByRole("textbox",{name:"输入内容",exact:true}).waitFor();await clickTool(page,"对比方案");
  const compactOwner=page.locator('iframe[title="产品预览 · compact"]'),compact=compactOwner.contentFrame(),compactColumn=page.locator('[data-candidate="compact"]');await compact.getByRole("textbox",{name:"输入内容",exact:true}).fill("固定右侧输入");const beforeSlot=await compactColumn.boundingBox();
  await selectPreview(page,"方案","third");await page.locator('iframe[title="产品预览 · third"]').contentFrame().getByRole("textbox",{name:"输入内容",exact:true}).waitFor();assert.equal((await compactColumn.boundingBox()).x,beforeSlot.x);assert.equal(await compact.getByRole("textbox",{name:"输入内容",exact:true}).inputValue(),"固定右侧输入");
  // Store-only routers use the declared path when no component adapter is registered.
  await page.close();const plainFolder=path.join(workspace,"requirements/store-routes");fs.cpSync(folder,plainFolder,{recursive:true});const plainManifest={...manifest,id:"store-routes",navigation:{pageStatePath:"/route"}};fs.writeFileSync(path.join(plainFolder,"manifest.json"),JSON.stringify(plainManifest));
  for(const candidate of plainManifest.candidates)fs.writeFileSync(path.join(plainFolder,candidate.registry),source.replace(/const navigate=usePreviewNavigation\(.*?;\n/,'const navigate=next=>set("/route",next);usePreviewState({dirty});\n'));
  page=await browser.newPage({viewport:{width:1680,height:1200}});page.setDefaultTimeout(10000);await page.goto(service.origin+"/?id=store-routes");const storeFrame=page.locator('iframe[title="产品预览 · comfortable"]').contentFrame();await storeFrame.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();await storeFrame.getByRole("button",{name:"打开摘要",exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="summary");await selectPreview(page,"页面","form");await page.waitForFunction(()=>document.querySelector('[aria-label="页面"]').getAttribute("data-value")==="form");await storeFrame.getByRole("textbox",{name:"输入内容",exact:true}).waitFor();
  console.log(JSON.stringify({navigation:"pass",guard:"pass",retainedSession:"pass",conditionalAnnotations:"pass",readerModes:5,dimensionTemplates:5,minimalDimension:"pass",dimensionWidths:[1680,360,320],explicitReset:"pass",compareAnnotationOwnership:"pass",linkedPages:"pass",twoSideGuard:"pass",confirmedSideLocked:"pass",thirdCandidateSlots:"pass",stableComparisonSlots:"pass",independentBusinessState:"pass",linkedAnnotation:"pass",linkedSceneAndViewport:"pass",storeRouter:"pass",crossPageProposal:"pass",cancelledNavigationIsolation:"pass",hiddenTarget:"pass",offlineHttpRequests:0}));
}finally{await browser?.close();await service?.close();fs.rmSync(base,{recursive:true,force:true});}
