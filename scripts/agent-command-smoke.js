import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {initialize} from '../workbench/src/backend/services/workspace.mjs';
import {startServer} from '../workbench/src/backend/http/server.mjs';
import {testConnection,memoryPreferences} from '../tests/helpers/codex-connection.mjs';
import {openPanel,waitForModelSettings} from './browser-ui.js';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-agent-command-')),workspace=initialize(base,{example:true}).workspace;
const errors=[],checks=[],screenshots=process.env.DH_SMOKE_SCREENSHOT_DIR;
const command="/bin/zsh -lc 'node <<\"NODE\"\n"+Array.from({length:24},(_,index)=>'console.log("核对第 '+index+' 项布局、状态和交互反馈");').join('\n')+"\nNODE'";
const cwd=path.join(base,'nested-directory-'.repeat(16),'resources');
const output=Array.from({length:60},(_,index)=>'  '+index+': **原始输出** <script>不会执行</script>').join('\n')+'\n';
let turn,finish;
const service=await startServer(workspace,{port:0,agentConnection:testConnection(),agentPreferences:memoryPreferences(),agentRun:input=>{
  turn=input;input.onEvent({id:'long-command',label:'执行命令',kind:'command',status:'running',command,cwd,output});
  return new Promise((resolve,reject)=>{finish=resolve;input.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});
}});
let browser;
const pass=name=>{checks.push(name);console.log('PASS '+name);};
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1050}});page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(service.origin);await openPanel(page,'Agent');await waitForModelSettings(page);
  const log=page.getByRole('log',{name:'Agent 对话记录',exact:true}),latest=page.getByRole('button',{name:'回到最新',exact:true});
  const canvas=page.locator('iframe[title="产品预览 · comfortable"]'),canvasBefore=await canvas.boundingBox();
  await page.getByRole('textbox',{name:'发给 Agent',exact:true}).fill('检查命令展示');await page.getByRole('button',{name:'发送',exact:true}).click();
  const process=log.locator('.agent-process').last(),commands=process.locator('.agent-command-activity'),first=commands.first(),summary=first.locator(':scope > summary');
  async function headingVisible(){const box=await summary.boundingBox(),outer=await log.boundingBox();assert.ok(box.y>=outer.y-1&&box.y+box.height<=outer.y+outer.height+1);}
  await first.waitFor();await summary.getByRole('img',{name:'执行中',exact:true}).waitFor();
  assert.equal(await first.getAttribute('open'),null);
  assert.ok((await first.boundingBox()).height<=30);
  assert.equal(await summary.locator('.agent-command-preview').getAttribute('title'),command);
  assert.ok(await summary.locator('.agent-command-preview').evaluate(node=>node.scrollWidth>node.clientWidth));
  assert.equal(await first.locator('.agent-command-body').isVisible(),false);
  assert.deepEqual(await canvas.boundingBox(),canvasBefore);pass('执行中命令默认单行，长命令省略并保留完整 title，画布不移动');

  await summary.focus();await summary.press('Enter');await first.locator('.agent-command-body').waitFor();
  await headingVisible();
  assert.equal(await first.locator('.agent-command').textContent(),command);
  assert.equal(await first.locator('.agent-directory').getAttribute('title'),cwd);
  assert.equal(await first.locator('.agent-output pre').textContent(),output);
  assert.equal(await first.locator('.agent-output script,.agent-output img').count(),0);
  assert.equal(await first.locator('details').count(),0);
  for(const block of [first.locator('.agent-command'),first.locator('.agent-output pre')]){
    assert.ok((await block.boundingBox()).height<=180);
    assert.ok(await block.evaluate(node=>node.scrollHeight>node.clientHeight));
  }
  pass('键盘展开一次即可读取完整命令、目录和原始输出，保留详情开头，长内容在区内滚动');

  const updatedOutput=output+'\n增量输出保持原文：`node --version`\n';
  turn.onEvent({id:'long-command',label:'执行命令',kind:'command',status:'running',command,cwd,output:updatedOutput});
  await page.waitForFunction(expected=>document.querySelector('.agent-command-activity .agent-output pre')?.textContent===expected,updatedOutput);
  assert.notEqual(await first.getAttribute('open'),null);await headingVisible();
  turn.onEvent({id:'long-command',label:'执行命令',kind:'command',status:'done',command,cwd,output:updatedOutput,exitCode:0});
  await summary.getByText('退出码 0',{exact:true}).waitFor();await summary.getByRole('img',{name:'已完成',exact:true}).waitFor();
  assert.notEqual(await first.getAttribute('open'),null);await summary.click();await first.locator('.agent-command-body').waitFor({state:'hidden'});
  pass('增量输出与执行结束实时更新状态，并保留用户选择的展开状态');

  turn.onEvent({id:'failed-command',label:'执行命令',kind:'command',status:'failed',command:'npm run check',cwd,output:'校验失败：缺少必填字段\n',exitCode:17});
  turn.onEvent({id:'cancelled-command',label:'执行命令',kind:'command',status:'cancelled',command:'node long-running-check.mjs',exitCode:130});
  turn.onEvent({id:'nonzero-command',label:'执行命令',kind:'command',status:'done',command:'node check-result.mjs',exitCode:2});
  turn.onEvent({id:'pending-command',label:'执行命令',kind:'command',status:'running',command:''});
  turn.onEvent({id:'tool-output',label:'调用工具',kind:'tool',status:'done',output:'普通工具输出保留独立折叠入口'});
  await commands.nth(1).getByRole('img',{name:'执行失败',exact:true}).waitFor();
  await commands.nth(2).getByRole('img',{name:'已取消',exact:true}).waitFor();
  await commands.nth(3).getByRole('img',{name:'执行失败',exact:true}).waitFor();
  await commands.nth(4).getByRole('img',{name:'执行中',exact:true}).waitFor();
  assert.equal(await commands.nth(1).locator('.agent-command-outcome').textContent(),'退出码 17');
  assert.equal(await commands.nth(3).locator('.agent-command-outcome').textContent(),'退出码 2');
  assert.equal(await commands.locator(':scope > .agent-command-body:visible').count(),0);
  assert.equal(await process.locator('details.agent-output > summary').isVisible(),true);
  pass('失败、取消及非零退出码在折叠行可辨认，尚无命令正文和普通工具输出也可展示');

  for(const width of [1500,360,320]){
    await page.setViewportSize({width,height:1050});
    for(const row of await commands.all()){
      assert.ok((await row.boundingBox()).height<=30);
      const code=await row.locator('.agent-command-outcome').boundingBox(),box=await row.boundingBox();
      assert.ok(code.x>=box.x&&code.x+code.width<=box.x+box.width+1);
    }
    assert.equal(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth),true);
    assert.equal(await log.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'commands-collapsed-'+width+'.png')});}
    await summary.click();await first.locator('.agent-command-body').waitFor();
    assert.equal(await first.locator('.agent-command').textContent(),command);
    assert.equal(await first.locator('.agent-output pre').textContent(),updatedOutput);
    assert.equal(await log.evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    const directory=await first.locator('.agent-directory-path').textContent();assert.ok(directory.includes('...')&&cwd.startsWith(directory.split('...')[0])&&cwd.endsWith(directory.split('...')[1]));
    await headingVisible();
    if(screenshots)await page.screenshot({path:path.join(screenshots,'commands-expanded-'+width+'.png')});
    await summary.click();await first.locator('.agent-command-body').waitFor({state:'hidden'});
  }
  pass('桌面和360/320px的命令均保持单行，退出码可见，展开内容无横向溢出');

  await page.setViewportSize({width:1500,height:1050});
  const note=Array.from({length:28},(_,index)=>'第 '+index+' 段：核对界面反馈、命令结果和设计约束。').join('\n\n');
  turn.onEvent({id:'note',label:'Agent 进展',kind:'message',status:'running',text:note});
  await log.getByText('第 27 段：核对界面反馈、命令结果和设计约束。',{exact:true}).waitFor({state:'attached'});
  async function bottom(){await page.waitForFunction(()=>{const node=document.querySelector('.agent-messages');return node&&node.scrollHeight-node.scrollTop-node.clientHeight<2;});}
  if(await latest.isVisible())await latest.click();await bottom();
  await log.hover();await page.mouse.wheel(0,-650);await latest.waitFor();const top=await log.evaluate(node=>node.scrollTop);
  turn.onEvent({id:'long-command',label:'执行命令',kind:'command',status:'done',command,cwd,output:updatedOutput+'后台补充结果\n',exitCode:0});
  await page.waitForFunction(()=>document.querySelector('.agent-command-activity .agent-output pre')?.textContent?.endsWith('后台补充结果\n'));
  assert.ok(Math.abs(await log.evaluate(node=>node.scrollTop)-top)<2);
  assert.equal(await first.getAttribute('open'),null);
  await latest.click();await bottom();
  turn.onEvent({id:'last-command',label:'执行命令',kind:'command',status:'done',command:'node final-check.mjs',output:'最终检查通过',exitCode:0});
  await commands.last().locator(':scope > summary').getByText('node final-check.mjs',{exact:true}).waitFor();await bottom();
  pass('折叠命令更新不打断上翻阅读，一键置底后继续跟随新增命令');

  finish({summary:'命令展示验证完成',files:[]});await log.getByText('命令展示验证完成',{exact:true}).waitFor();
  await page.reload();await openPanel(page,'Agent');await log.getByText('命令展示验证完成',{exact:true}).waitFor();
  await process.locator(':scope > summary').click();await summary.waitFor();
  assert.equal(await first.getAttribute('open'),null);await summary.click();
  assert.equal(await first.locator('.agent-command').textContent(),command);
  assert.equal(await first.locator('.agent-output pre').textContent(),updatedOutput+'后台补充结果\n');
  await process.locator('details.agent-output > summary').click();await process.getByText('普通工具输出保留独立折叠入口',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);pass('刷新恢复完整命令与输出，默认折叠，普通工具输出仍可独立展开');
  console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await browser?.close();await service.close();fs.rmSync(base,{recursive:true,force:true});}
