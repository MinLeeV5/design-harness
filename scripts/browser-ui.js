// Open controls through the same header and drawer buttons a user operates.
export async function openSettings(page){if(!await page.locator('#studio-settings').isVisible())await page.getByRole('button',{name:'预览设置',exact:true}).click();}
export async function openChoice(trigger){const page=trigger.page();if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();const label=await trigger.getAttribute('aria-label'),popup=page.locator('[data-workbench-select-popup][aria-label='+JSON.stringify(label+'选项')+']');await popup.waitFor();return popup;}
export async function chooseOption(trigger,value){const popup=await openChoice(trigger);await popup.locator('[role="option"][data-value='+JSON.stringify(value)+']').click();await popup.waitFor({state:'hidden'});}
export async function choiceOptions(trigger){const popup=await openChoice(trigger),options=await popup.getByRole('option').evaluateAll(items=>items.map(item=>({value:item.getAttribute('data-value'),label:item.textContent,disabled:item.getAttribute('aria-disabled')==='true'})));await trigger.page().keyboard.press('Escape');await popup.waitFor({state:'hidden'});return options;}
export async function selectPreview(page,name,value){const inHeader=name==='页面'||name==='场景';if(!inHeader)await openSettings(page);await chooseOption(previewField(page,name),value);if(!inHeader)await page.getByRole('button',{name:'关闭预览设置',exact:true}).click();}
export function previewField(page,name){return page.locator('[data-workbench-select][aria-label='+JSON.stringify(name)+']');}
export async function openPanel(page,name='Agent'){
 const trigger=page.getByRole('navigation',{name:'辅助面板',exact:true}).getByRole('button',{name,exact:true});if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
}
export async function clickTool(page,name){await openPanel(page,'工具');await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'关闭辅助面板',exact:true}).click();}
