import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {buildRequirement} from "../workbench/src/backend/services/preview.mjs";

const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-browser-")),workspace=initialize(project,{example:true}).workspace;
let browser;
try{
  const {payload}=await buildRequirement(workspace,"example");browser=await chromium.launch({channel:"chrome",headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  await page.setContent('<iframe sandbox="allow-scripts" style="width:1200px;height:960px;border:0"></iframe>');
  const config={scenario:payload.scenarios[0],candidate:"comfortable",page:"task",session:"overlay-test",spec:payload.specs["comfortable:task"],css:payload.params.comfortable.css,pick:false,reviewPick:false,showReviews:true,reviews:[]};
  await page.evaluate(({html,config})=>{window.reviewConfig=config;window.reviewEvents=[];window.addEventListener("message",e=>{if(e.source!==document.querySelector("iframe").contentWindow)return;if(e.data.type==="dh:mounted")e.source.postMessage({type:"dh:config",config:window.reviewConfig},"*");if(e.data.type.startsWith("dh:review"))window.reviewEvents.push(e.data);});document.querySelector("iframe").srcdoc=html;},{html:payload.previews.comfortable,config});
  const host=page.locator("iframe"),frame=host.contentFrame();await frame.getByRole("button",{name:"开始整理",exact:true}).waitFor();
  const configure=patch=>page.evaluate(patch=>{window.reviewConfig={...window.reviewConfig,...patch};document.querySelector("iframe").contentWindow.postMessage({type:"dh:config",config:window.reviewConfig},"*");},patch);
  async function clickAt(target){const p=await target.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,w:innerWidth,h:innerHeight};}),b=await host.boundingBox();await page.mouse.click(b.x+p.x*b.width/p.w,b.y+p.y*b.height/p.h);}
  await configure({reviewPick:true});await clickAt(frame.getByRole("button",{name:"开始整理",exact:true}));
  await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-point"));
  const picked=await page.evaluate(()=>window.reviewEvents.find(e=>e.type==="dh:review-point"));assert.equal(picked.anchor.target,"task-form/submit");assert.ok(picked.html.includes('id="topic"'));assert.ok(!picked.html.includes('id="dh-review-'));
  assert.equal(await frame.getByText("请填写任务主题",{exact:true}).count(),0,"落针不能提交产品表单");
  await configure({reviewPick:false,reviews:[{id:"first",number:1,anchor:picked.anchor}]});const pin=frame.getByRole("button",{name:"批阅 1",exact:true});await pin.waitFor();
  const before=await pin.boundingBox(),targetBefore=await frame.getByRole("button",{name:"开始整理",exact:true}).boundingBox();await frame.locator(".form-footer").evaluate(el=>{el.style.marginTop="75px";});
  await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-locations"&&e.statuses.first==="located"));await page.waitForTimeout(80);const moved=await pin.boundingBox(),targetAfter=await frame.getByRole("button",{name:"开始整理",exact:true}).boundingBox();assert.ok(moved.y>before.y+1);assert.ok(Math.abs((moved.y-before.y)-(targetAfter.y-targetBefore.y))<3,"批阅针应跟随元素的实际位移");
  await frame.getByRole("button",{name:"开始整理",exact:true}).evaluate(el=>{el.hidden=true;});await pin.waitFor({state:"hidden"});await page.waitForFunction(()=>window.reviewEvents.at(-1)?.statuses?.first==="unavailable");
  await frame.locator('[data-dh-part="submit"]').evaluate(el=>{el.hidden=false;});await pin.waitFor();
  // A specific DOM target within a large component must not drift to its sibling.
  await frame.locator(".task-main").evaluate(el=>{const zone=document.createElement("div");zone.id="review-test-zone";zone.innerHTML='<button data-testid="first-control">第一项</button><button data-testid="second-control">第二项</button>';el.prepend(zone);});
  await page.evaluate(()=>window.reviewEvents=[]);await configure({reviewPick:true});await clickAt(frame.getByRole("button",{name:"第二项",exact:true}));await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-point"));const second=await page.evaluate(()=>window.reviewEvents.find(e=>e.type==="dh:review-point"));
  await configure({reviewPick:false,reviews:[{id:"second",number:2,anchor:second.anchor}]});await frame.getByRole("button",{name:"批阅 2",exact:true}).waitFor();
  await frame.locator("#review-test-zone").evaluate(el=>el.prepend(el.lastElementChild));await page.waitForTimeout(80);const b=await frame.getByRole("button",{name:"第二项",exact:true}).boundingBox(),marker=await frame.getByRole("button",{name:"批阅 2",exact:true}).boundingBox();assert.ok(Math.abs(marker.x-(b.x+b.width/2))<3);
  await frame.getByRole("button",{name:"第二项",exact:true}).evaluate(el=>el.remove());await frame.getByRole("button",{name:"批阅 2",exact:true}).waitFor({state:"hidden"});
  await frame.locator(".task-main").evaluate(el=>{const d=document.createElement("div");d.id="repeat-controls";d.innerHTML=[0,1].map(i=>'<div data-jr-key="repeated"><span data-dh-instance="/items/'+i+'"><button data-testid="repeat-control">重复按钮</button></span></div>').join("");el.prepend(d);});
  await page.evaluate(()=>window.reviewEvents=[]);await configure({reviewPick:true});await clickAt(frame.getByRole("button",{name:"重复按钮",exact:true}).nth(1));await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-point"));const repeated=await page.evaluate(()=>window.reviewEvents.find(e=>e.type==="dh:review-point"));assert.equal(repeated.anchor.instance,"/items/1");
  await configure({reviewPick:false,reviews:[{id:"repeated",number:4,anchor:repeated.anchor}]});await frame.getByRole("button",{name:"批阅 4",exact:true}).waitFor();await frame.locator('#repeat-controls > div').first().evaluate(el=>el.remove());
  await host.evaluate(el=>{el.style.transform="scale(.8)";el.style.transformOrigin="top left";});await page.waitForTimeout(80);const repeatedTarget=await frame.getByRole("button",{name:"重复按钮",exact:true}).boundingBox(),repeatedPin=await frame.getByRole("button",{name:"批阅 4",exact:true}).boundingBox();assert.ok(Math.abs(repeatedPin.y-(repeatedTarget.y+repeatedTarget.height/2))<3);
  await frame.locator(".task-main").evaluate(el=>{el.style.paddingTop="1200px";});await configure({reviewLocate:"repeated",locateNonce:1});await frame.getByRole("button",{name:"批阅 4",exact:true}).waitFor();await frame.locator(".task-main").evaluate(el=>{el.style.paddingTop="";});await frame.locator("body").evaluate(()=>scrollTo(0,0));await host.evaluate(el=>el.style.transform="");
  // Copy changes retain the unique stable target; geometry follows CSS/Web Animations too.
  await page.evaluate(()=>window.reviewEvents=[]);await configure({reviewPick:true});await clickAt(frame.locator("h1"));await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-point"));const heading=await page.evaluate(()=>window.reviewEvents.find(e=>e.type==="dh:review-point"));
  await configure({reviewPick:false,reviews:[{id:"heading",number:5,anchor:heading.anchor}]});const headingPin=frame.getByRole("button",{name:"批阅 5",exact:true});await headingPin.waitFor();await frame.locator("h1").evaluate(el=>el.textContent="已经调整的标题");await page.waitForTimeout(180);assert.ok(await headingPin.isVisible(),"稳定元素修改文案后仍应可定位");
  await frame.locator("h1").evaluate(el=>el.animate([{transform:"translateY(0px)"},{transform:"translateY(100px)"}],{duration:300,fill:"forwards"}).finished);await page.waitForTimeout(160);const headingBox=await frame.locator("h1").boundingBox(),headingMarker=await headingPin.boundingBox();assert.ok(Math.abs(headingMarker.y-(headingBox.y+headingBox.height*heading.anchor.y))<3,"动画结束后批阅针应位于实际目标上");
  await headingPin.evaluate(el=>window.reviewPinBefore=el);await page.waitForTimeout(180);assert.equal(await headingPin.evaluate(el=>el===window.reviewPinBefore),true,"几何跟踪不应重建按钮、丢失焦点或中断点击");await headingPin.hover();await page.mouse.down();await page.waitForTimeout(180);await page.mouse.up();await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-focus"&&e.id==="heading"));
  // Native modal dialogs use the top layer; review capture and pins remain operable there.
  await frame.locator("body").evaluate(el=>{const d=document.createElement("dialog");d.id="review-test-dialog";d.innerHTML='<button data-testid="dialog-control">弹窗按钮</button>';el.append(d);d.showModal();});
  await page.evaluate(()=>window.reviewEvents=[]);await configure({reviewPick:true});await clickAt(frame.getByRole("button",{name:"弹窗按钮",exact:true}));await page.waitForFunction(()=>window.reviewEvents.some(e=>e.type==="dh:review-point"));const modal=await page.evaluate(()=>window.reviewEvents.find(e=>e.type==="dh:review-point"));assert.ok(modal.html.includes("data-dh-capture-modal"));
  await configure({reviewPick:false,reviews:[{id:"modal",number:3,anchor:modal.anchor}]});await frame.getByRole("button",{name:"批阅 3",exact:true}).waitFor();
  await frame.locator("#review-test-dialog").evaluate(el=>el.close());await frame.getByRole("button",{name:"批阅 3",exact:true}).waitFor({state:"hidden"});
  await frame.locator("#review-test-dialog").evaluate(el=>el.remove());await page.waitForTimeout(260);
  await frame.locator("body").evaluate(el=>{const d=document.createElement("dialog");d.id="review-test-dialog";d.innerHTML='<button data-testid="dialog-control">弹窗按钮</button>';el.append(d);d.showModal();});
  await frame.getByRole("button",{name:"批阅 3",exact:true}).waitFor();await page.waitForFunction(()=>window.reviewEvents.at(-1)?.statuses?.modal==="located");
  console.log("批阅画布 Chrome 验收通过：落针拦截、实际快照、重排跟随、重复实例、缩放与滚动、文案与动画变化、目标删除及 portal 弹窗重建恢复。");
}finally{await browser?.close();fs.rmSync(project,{recursive:true,force:true});}
