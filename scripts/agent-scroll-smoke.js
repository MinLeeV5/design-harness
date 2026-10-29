import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {initialize} from '../workbench/src/backend/services/workspace.mjs';
import {startServer} from '../workbench/src/backend/http/server.mjs';
import {testConnection,memoryPreferences} from '../tests/helpers/codex-connection.mjs';
import {openPanel,chooseOption,selectPreview,waitForModelSettings} from './browser-ui.js';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-agent-scroll-')),workspace=initialize(base,{example:true}).workspace;
const turns=new Map(),errors=[],checks=[],screenshots=process.env.DH_SMOKE_SCREENSHOT_DIR;
const longText=Array.from({length:32},(_,i)=>'第 '+(i+1)+' 段：核对页面入口、交互条件与实际反馈。保留已确认的设计决定，并将本轮验证结果写入交接。').join('\n\n');
const service=await startServer(workspace,{port:0,agentConnection:testConnection(),agentPreferences:memoryPreferences(),agentRun:input=>{
  const text=JSON.parse(input.prompt.match(/User message: (.*)\n/)[1]);
  if(text==='历史记录')return Promise.resolve({summary:longText,files:[]});
  input.onEvent({id:'stream',label:'Agent 进展',kind:'message',status:'running',text:longText+'\n\n初始输出'});
  return new Promise((resolve,reject)=>{turns.set(text,{...input,resolve});input.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});
}});
let browser;
const pass=name=>{checks.push(name);console.log('PASS '+name);};
async function until(check){const end=Date.now()+20000;while(!check()){if(Date.now()>end)throw new Error('missing fixture turn');await new Promise(resolve=>setTimeout(resolve,20));}}
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1560,height:1050}});page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(service.origin);await openPanel(page,'Agent');await waitForModelSettings(page);
  const log=page.getByRole('log',{name:'Agent 对话记录',exact:true}),latest=page.getByRole('button',{name:'回到最新',exact:true});
  const picker=page.getByRole('combobox',{name:'Agent 会话',exact:true}),prompt=page.getByRole('textbox',{name:'发给 Agent',exact:true});
  const notice=page.getByRole('status',{name:'待审批提示',exact:true}),view=page.getByRole('button',{name:'查看审批',exact:true});
  const header=page.getByRole('navigation',{name:'辅助面板',exact:true}).getByRole('button',{name:'Agent',exact:true});
  const frame=page.locator('iframe[title="产品预览 · comfortable"]');
  async function send(text){await prompt.fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();}
  async function bottom(){await page.waitForFunction(()=>{const node=document.querySelector('.agent-messages');return node&&node.scrollHeight-node.scrollTop-node.clientHeight<2;});}
  async function up(){await log.hover();await page.mouse.wheel(0,-650);await latest.waitFor();}
  async function visibleWithin(locator,container){
    const box=await locator.boundingBox(),outer=await container.boundingBox();assert.ok(box&&outer);
    assert.ok(box.x>=outer.x-1&&box.x+box.width<=outer.x+outer.width+1);
    assert.ok(box.y>=outer.y-1&&box.y+box.height<=outer.y+outer.height+1);
  }
  async function capture(name){if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,name+'.png')});}}
  assert.equal(await latest.count(),0);assert.equal(await notice.count(),0);
  await send('历史记录');await log.locator('.message-state').last().getByText('已回复',{exact:true}).waitFor();await bottom();
  assert.ok(await log.evaluate(node=>node.scrollHeight>node.clientHeight+500));
  assert.ok(await page.locator('.agent-body').evaluate(node=>node.scrollHeight<=node.clientHeight+1));
  await visibleWithin(prompt,page.getByRole('dialog',{name:'Agent',exact:true}));pass('长记录只滚动消息区，输入框保持可见');
  const canvasBefore=await frame.boundingBox();await up();await visibleWithin(latest,page.locator('.agent-conversation'));
  await latest.focus();await latest.press('Enter');await latest.waitFor({state:'hidden'});await bottom();assert.equal(await log.evaluate(node=>node===document.activeElement),true);
  assert.deepEqual(await frame.boundingBox(),canvasBefore);pass('一键和键盘置底，焦点进入消息区，产品画布不移动');

  await send('持续输出');await until(()=>turns.has('持续输出'));await log.getByText('初始输出',{exact:true}).waitFor();await bottom();
  const stream=turns.get('持续输出'),emit=text=>stream.onEvent({id:'stream',label:'Agent 进展',kind:'message',status:'running',text:longText+'\n\n'+text});
  emit('自动跟随输出');await log.getByText('自动跟随输出',{exact:true}).waitFor();await bottom();
  await up();const top=await log.evaluate(node=>node.scrollTop);emit('上翻后继续输出');await log.getByText('上翻后继续输出',{exact:true}).waitFor({state:'attached'});
  assert.ok(Math.abs(await log.evaluate(node=>node.scrollTop)-top)<2);assert.equal(await latest.isVisible(),true);pass('持续输出跟随底部，上翻阅读保持位置');
  await latest.click();await bottom();emit('恢复跟随输出');await log.getByText('恢复跟随输出',{exact:true}).waitFor();await bottom();
  const process=log.locator('.agent-process').last();await process.locator(':scope > summary').click();await process.locator(':scope > summary').click();
  await latest.waitFor();await latest.click();await bottom();
  pass('置底恢复跟随，查看历史过程的折叠和展开后仍可回到最新');
  stream.resolve({summary:longText+'\n\n流式回复完成',files:[]});await log.getByText('流式回复完成',{exact:true}).waitFor();

  await send('需要审批');await until(()=>turns.has('需要审批'));await log.getByText('初始输出',{exact:true}).waitFor();await bottom();await up();
  const waiting=turns.get('需要审批'),firstDecision=waiting.onApproval({kind:'command',title:'执行命令需要批准',command:'node --version',choices:['accept','decline','cancel']});
  const withdrawn=new AbortController(),secondDecision=waiting.onApproval({kind:'permissions',title:'扩展访问权限需要批准',reason:'合成权限确认',choices:['accept','decline','cancel']},{signal:withdrawn.signal});
  await notice.getByText('当前会话 2 项操作待确认',{exact:true}).waitFor();assert.equal(await latest.isVisible(),true);
  await header.getByRole('status',{name:'1 个会话等待审批',exact:true}).waitFor();assert.equal(await header.locator('.loading-spinner').count(),0);
  await visibleWithin(notice,page.getByRole('dialog',{name:'Agent',exact:true}));assert.equal(await page.locator('.agent-waiting').count(),0);
  await capture('approval-notice-desktop');pass('上翻时待审批提示固定可见，入口用待审批标记区分生成中');
  await view.click();const firstCard=page.locator('[data-agent-approval-id]').first();
  assert.equal(await firstCard.evaluate(node=>node===document.activeElement),true);
  const cardBox=await firstCard.boundingBox(),logBox=await log.boundingBox();assert.ok(cardBox.y>=logBox.y-1&&cardBox.y<logBox.y+logBox.height);
  await firstCard.getByRole('button',{name:'批准本次',exact:true}).click();assert.equal((await firstDecision).decision,'accept');
  await notice.getByText('当前会话 1 项操作待确认',{exact:true}).waitFor();withdrawn.abort();assert.equal((await secondDecision).decision,'cancel');
  await notice.waitFor({state:'hidden'});await header.locator('.agent-approval-badge').waitFor({state:'hidden'});
  waiting.resolve({summary:'本轮审批已处理',files:[]});await log.getByText('本轮审批已处理',{exact:true}).waitFor();pass('查看审批定位并聚焦卡片，多项审批逐项更新，撤销后提示清除');

  await send('后台审批');await until(()=>turns.has('后台审批'));const background=turns.get('后台审批');
  const backgroundDecision=background.onApproval({kind:'file',title:'修改文件需要批准',reason:'修改合成提案副本',choices:['accept','decline','cancel']});
  await notice.waitFor();const first=await picker.getAttribute('data-value');
  await page.getByRole('button',{name:'新建会话',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="Agent 会话"]').getAttribute('data-value')!==id,first);await waitForModelSettings(page);
  const second=await picker.getAttribute('data-value');await prompt.fill('保留其他会话草稿');await notice.getByText('1 个其他会话待确认',{exact:true}).waitFor();
  assert.equal(await latest.count(),0);await page.getByRole('button',{name:'关闭辅助面板',exact:true}).click();await header.locator('.agent-approval-badge').waitFor();
  await openPanel(page,'Agent');await notice.waitFor();
  for(const width of [360,320]){
    await page.setViewportSize({width,height:950});await visibleWithin(notice,page.getByRole('dialog',{name:'Agent',exact:true}));
    await visibleWithin(header.locator('.agent-approval-badge'),page.locator('.studio-header'));
    assert.equal(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth),true);
    await capture('approval-notice-'+width);
  }
  await view.click();await page.waitForFunction(id=>document.querySelector('[aria-label="Agent 会话"]').getAttribute('data-value')===id,first);
  await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-agent-approval-id'));
  await page.locator('[data-agent-approval-id]').getByRole('button',{name:'拒绝',exact:true}).click();assert.equal((await backgroundDecision).decision,'decline');
  background.resolve({summary:'后台审批已拒绝',files:[]});await log.getByText('后台审批已拒绝',{exact:true}).waitFor();await notice.waitFor({state:'hidden'});
  await chooseOption(picker,second);assert.equal(await prompt.inputValue(),'保留其他会话草稿');assert.equal(await latest.count(),0);
  pass('面板收起与其他会话均可发现待审批，点击切换并定位，草稿保持');

  await chooseOption(picker,first);await bottom();await up();await visibleWithin(latest,page.locator('.agent-conversation'));await capture('scroll-latest-mobile');
  await latest.click();await bottom();await selectPreview(page,'方案','compact');await openPanel(page,'Agent');await page.waitForFunction(id=>document.querySelector('[aria-label="Agent 会话"]').getAttribute('data-value')!==id,first);
  assert.equal(await latest.count(),0);assert.equal(await notice.count(),0);pass('手机置底可操作，切换会话与候选不残留旧提示');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await browser?.close();await service.close();fs.rmSync(base,{recursive:true,force:true});}
