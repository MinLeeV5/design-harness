// Open controls through the same drawer buttons a user operates.
export async function openSettings(page){if(!await page.locator('#studio-settings').isVisible())await page.getByRole('button',{name:'预览设置',exact:true}).click();}
export async function selectPreview(page,name,value){await openSettings(page);await page.getByRole('combobox',{name,exact:true}).selectOption(value);await page.getByRole('button',{name:'关闭预览设置',exact:true}).click();}
export function previewField(page,name){return page.locator('select[aria-label="'+name+'"]');}
export async function openPanel(page,name='Agent'){
 if(!await page.locator('#studio-inspector').isVisible())await page.getByRole('button',{name:'工作台工具',exact:true}).click();
 const tab=page.getByRole('button',{name,exact:true});if(await tab.getAttribute('aria-pressed')!=='true')await tab.click();
}
export async function clickTool(page,name){await openPanel(page,'工具');await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'关闭辅助面板',exact:true}).click();}
