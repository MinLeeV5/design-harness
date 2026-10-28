import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {initialize} from '../workbench/src/backend/services/workspace.mjs';
import {startServer} from '../workbench/src/backend/http/server.mjs';
import {testConnection,memoryPreferences} from '../tests/helpers/codex-connection.mjs';
import {openPanel,chooseOption,choiceOptions,chooseAgentSetting,openModelSettings,waitForModelSettings} from './browser-ui.js';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'dh-permissions-browser-')),workspace=initialize(base,{example:true}).workspace,errors=[],calls=[];
const relative='requirements/example/candidates/comfortable/pages/task.json',source=path.join(workspace,relative),before=fs.readFileSync(source);
const longCommand="/bin/zsh -lc 'node --version && "+'node --version && '.repeat(12)+"node --version'",longDirectory=path.join(base,'嵌套目录 with spaces','long-directory-segment-'.repeat(10),'resources');
const screenshotDirectory=process.env.DH_SMOKE_SCREENSHOT_DIR;
const service=await startServer(workspace,{port:0,agentConnection:testConnection(),agentPreferences:memoryPreferences(),agentRun:async input=>{
 const text=JSON.parse(input.prompt.match(/User message: (.*)\n/)[1]);calls.push({text,mode:input.permissionMode});
 if(text==='工具确认'||text==='工具确认空值'){
  const empty=text==='工具确认空值';
  const answer=await input.onApproval({kind:'mcp',title:'工具需要确认',reason:empty?'此工具字段允许空值':'填写访问用途后继续',fields:[{id:'purpose',label:'访问用途',type:'string',required:true,minLength:empty?0:2,...(empty?{maxLength:0}:{})}],choices:['accept','decline','cancel']});
  return {summary:empty&&answer.content?.purpose===''?'空值已提交':'工具用途：'+answer.content?.purpose,files:[]};
 }
 if(text==='修改副本'){const file=path.join(input.directory,relative),spec=JSON.parse(fs.readFileSync(file));spec.elements['task-page'].props.title='原生命令修改的副本';fs.writeFileSync(file,JSON.stringify(spec));return {summary:'副本已修改，等待接受',files:[]};}
 if(text.startsWith('请求')){
  input.onEvent({id:'summary',label:'思考摘要',kind:'reasoning',status:'done',text:'核对布局和命令执行结果。'});
  const command=text==='请求长命令'?longCommand:'node --version',cwd=text==='请求长命令'?longDirectory:text==='请求短目录'?'/tmp':input.directory;
  const answer=await input.onApproval({kind:'command',title:'执行命令需要批准',command,cwd,reason:'确认本轮可用的 Node 版本',choices:['accept','decline','cancel']});
  input.onEvent({id:'command',label:'执行命令',kind:'command',command,cwd,output:answer.decision==='accept'?'v22.0.0\n':'未执行命令',exitCode:answer.decision==='accept'?0:1,status:answer.decision==='accept'?'done':'cancelled'});
  return {summary:'命令审批结果：'+answer.decision,files:[]};
 }
 return {summary:'当前权限：'+input.permissionMode,files:[]};
}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.goto(service.origin);await openPanel(page,'Agent');
 const permission=page.getByRole('button',{name:'模型',exact:true}),sessions=page.getByRole('combobox',{name:'Agent 会话',exact:true}),prompt=page.getByRole('textbox',{name:'发给 Agent',exact:true});
 await waitForModelSettings(page);assert.equal(await permission.getAttribute('data-permission-mode'),'proposal');
 const initialPermissions=await openModelSettings(page,'permission');assert.deepEqual(await initialPermissions.getByRole('tabpanel',{name:'权限',exact:true}).getByRole('option').evaluateAll(options=>options.map(option=>option.getAttribute('data-value'))),['read-only','proposal','full-access']);await initialPermissions.getByRole('button',{name:'关闭模型设置',exact:true}).click();await initialPermissions.waitFor({state:'hidden'});
 const first=await sessions.getAttribute('data-value');assert.match(await permission.getAttribute('title'),/提案工作区/);
 await chooseAgentSetting(page,'permission','full-access');assert.equal(await permission.locator('.model-full-access').count(),1);assert.match(await permission.getAttribute('title'),/完全访问/);assert.equal(await page.locator('.agent-compose-area .agent-permission-warning').count(),0);const permissionPopup=await openModelSettings(page,'permission');assert.match(await permissionPopup.getByRole('tabpanel',{name:'权限',exact:true}).locator('.agent-permission-warning').textContent(),/接受提案前修改源文件.*不会自动撤销/);await permissionPopup.getByRole('button',{name:'关闭模型设置',exact:true}).click();await permissionPopup.waitFor({state:'hidden'});
 async function send(text){await prompt.fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();}
 async function capture(name){if(screenshotDirectory){await page.getByRole('log').evaluate(node=>{node.scrollTop=node.scrollHeight;});await page.screenshot({path:path.join(screenshotDirectory,name+'.png')});}}
 async function oneLine(locator){
  const box=await locator.evaluate(node=>({height:node.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(node).lineHeight),width:node.clientWidth,scrollWidth:node.scrollWidth}));
  assert.ok(box.height<=box.lineHeight+1,'保持单行');assert.ok(box.scrollWidth<=box.width+1,'内容不横向溢出');
 }
 async function directory(locator,expected,truncated=true){
  await locator.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  assert.equal(await locator.getAttribute('title'),expected);const text=await locator.locator('.agent-directory-path').textContent();
  if(truncated){const parts=text.split('...');assert.equal(parts.length,2);assert.ok(parts.every(Boolean));assert.ok(expected.startsWith(parts[0])&&expected.endsWith(parts[1]));assert.ok(text.length<expected.length);}else assert.equal(text,expected);
  await oneLine(locator);
 }
 async function result(status,command='node --version'){
  await approval.waitFor({state:'hidden'});const row=page.locator('.agent-approval-result').last();await row.getByText('命令'+status,{exact:true}).waitFor();
  assert.equal(await row.locator('.approval-command').getAttribute('title'),command);assert.equal(await row.getAttribute('aria-label'),command+' 命令'+status);
  assert.equal(await page.getByRole('region',{name:'执行命令需要批准'}).count(),0);assert.equal(await row.locator('pre,button,.agent-directory').count(),0);await oneLine(row);return row;
 }
 await send('全权限讨论');await page.getByRole('log').getByText('当前权限：full-access',{exact:true}).waitFor();assert.equal(calls.at(-1).mode,'full-access');await chooseAgentSetting(page,'permission','read-only');assert.equal(await permission.locator('.model-full-access').count(),0);assert.match(await permission.getAttribute('title'),/只读分析/);await page.locator('.agent-compose-area .agent-permission-warning').waitFor({state:'hidden'});assert.equal(await page.locator('.message-permission').count(),1);console.log('PASS 三档图标、完全访问提示和每轮权限记录');
 await page.getByRole('button',{name:'新建会话',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="Agent 会话"]').getAttribute('data-value')!==id,first);const second=await sessions.getAttribute('data-value');assert.equal(await permission.getAttribute('data-permission-mode'),'proposal');await send('乙会话');await page.getByRole('log').getByText('当前权限：proposal',{exact:true}).waitFor();await chooseOption(sessions,first);assert.equal(await permission.getAttribute('data-permission-mode'),'read-only');console.log('PASS 权限按会话隔离，新会话使用提案工作区');
 await send('请求批准');const approval=page.getByRole('region',{name:'执行命令需要批准'});await page.getByRole('button',{name:'批准本次',exact:true}).waitFor();assert.equal(await permission.isDisabled(),true);assert.match(await page.locator('.agent-approval').textContent(),/node --version/);
 await chooseOption(sessions,second);assert.equal(await page.getByRole('button',{name:'批准本次',exact:true}).count(),0);await chooseOption(sessions,first);await page.getByRole('button',{name:'批准本次',exact:true}).waitFor();await page.reload();await openPanel(page,'Agent');await page.getByRole('button',{name:'批准本次',exact:true}).waitFor();assert.equal(await permission.getAttribute('data-permission-mode'),'read-only');await page.getByRole('button',{name:'批准本次',exact:true}).click();await page.getByRole('log').getByText('命令审批结果：accept',{exact:true}).waitFor();const process=page.locator('.agent-process').last();if(!await process.getAttribute('open'))await process.locator(':scope > summary').click();await process.getByText('核对布局和命令执行结果。',{exact:true}).waitFor();await process.locator('.agent-output > summary').click();await process.getByText('v22.0.0',{exact:false}).waitFor();assert.match(await process.textContent(),/退出码 0/);console.log('PASS 审批归属、刷新恢复和执行过程展示');
 await result('已批准 ✅');await page.reload();await openPanel(page,'Agent');await result('已批准 ✅');console.log('PASS 批准后只留单行结果，刷新保留命令与结果');
 await send('请求拒绝');await page.getByRole('button',{name:'拒绝',exact:true}).click();await page.getByRole('log').getByText('命令审批结果：decline',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'批准本次',exact:true}).count(),0);
 await result('已拒绝');await send('请求取消操作');await page.getByRole('button',{name:'取消操作',exact:true}).click();await page.getByRole('log').getByText('命令审批结果：cancel',{exact:true}).waitFor();await result('已取消');
 await send('请求取消');await page.getByRole('button',{name:'批准本次',exact:true}).waitFor();await page.getByRole('button',{name:'取消生成',exact:true}).click();await page.getByRole('log').getByText('已取消本轮请求',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'批准本次',exact:true}).count(),0);console.log('PASS 拒绝和取消后审批失效');
 await result('已取消');await send('请求长命令');await page.getByRole('button',{name:'批准本次',exact:true}).waitFor();
 for(const width of [1500,360,320]){await page.setViewportSize({width,height:950});await directory(approval.locator('.agent-directory'),longDirectory);assert.equal(await approval.locator('pre').textContent(),longCommand);assert.equal(await page.getByRole('log').evaluate(node=>node.scrollWidth<=node.clientWidth),true);await capture('approval-pending-'+width);}
 await page.getByRole('button',{name:'批准本次',exact:true}).click();await page.locator('.agent-message.assistant').last().getByText('命令审批结果：accept',{exact:true}).waitFor();
 const longProcess=page.locator('.agent-process').last();await longProcess.locator(':scope > summary').click();await directory(longProcess.locator('.agent-directory'),longDirectory);
 for(const width of [320,360,1500]){
  await page.setViewportSize({width,height:950});const row=await result('已批准 ✅',longCommand);await directory(longProcess.locator('.agent-directory'),longDirectory);
  assert.equal(await row.locator('.approval-command').evaluate(node=>node.scrollWidth>node.clientWidth),true);assert.equal(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth),true);assert.equal(await page.getByRole('log').evaluate(node=>node.scrollWidth<=node.clientWidth),true);await capture('approval-result-'+width);
 }
 await page.reload();await openPanel(page,'Agent');await result('已批准 ✅',longCommand);const restored=page.locator('.agent-process').last();await restored.locator(':scope > summary').click();await directory(restored.locator('.agent-directory'),longDirectory);console.log('PASS 长命令结果与长目录在桌面、360/320px、展开和刷新后保持单行及完整 title');
 await send('请求短目录');await page.getByRole('button',{name:'批准本次',exact:true}).waitFor();await directory(approval.locator('.agent-directory'),'/tmp',false);await page.getByRole('button',{name:'批准本次',exact:true}).click();await result('已批准 ✅');console.log('PASS 短目录完整显示');
 await send('工具确认');await page.getByRole('button',{name:'批准本次',exact:true}).click();await page.getByRole('alert').filter({hasText:'请填写：访问用途'}).waitFor();await page.getByRole('textbox',{name:'访问用途',exact:false}).fill('核对设计');await page.getByRole('button',{name:'批准本次',exact:true}).click();await page.getByRole('log').getByText('工具用途：核对设计',{exact:true}).waitFor();console.log('PASS 工具确认表单校验与答复');
 await send('工具确认空值');await page.getByRole('button',{name:'批准本次',exact:true}).click();await page.getByRole('log').getByText('空值已提交',{exact:true}).waitFor();console.log('PASS 工具确认允许合法的必填空字符串');
 await chooseAgentSetting(page,'permission','proposal');await send('修改副本');await page.getByRole('button',{name:'接受修改',exact:true}).waitFor();assert.deepEqual(fs.readFileSync(source),before);await page.getByRole('button',{name:'接受修改',exact:true}).click();await page.getByRole('log').getByText('已接受',{exact:true}).waitFor();assert.equal(JSON.parse(fs.readFileSync(source)).elements['task-page'].props.title,'原生命令修改的副本');console.log('PASS 工具修改副本进入提案，仅接受后写回');
 for(const width of [360,320]){await page.setViewportSize({width,height:950});await openPanel(page,'Agent');await chooseAgentSetting(page,'permission','full-access');assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth<=innerWidth),true);const box=await page.getByRole('dialog',{name:'Agent',exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);assert.equal(await permission.locator('.model-full-access').count(),1);assert.equal(await page.locator('.agent-compose-area .agent-permission-warning').count(),0);const popup=await openModelSettings(page,'permission');assert.equal(await popup.getByRole('tabpanel',{name:'权限',exact:true}).locator('.agent-permission-warning').isVisible(),true);await popup.getByRole('button',{name:'关闭模型设置',exact:true}).click();await popup.waitFor({state:'hidden'});}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({permissions:'deterministic model fixture; real HTTP and Chrome',passed:12,errors}));
}finally{await browser?.close();await service.close();fs.rmSync(base,{recursive:true,force:true});}
