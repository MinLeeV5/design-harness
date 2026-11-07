import {requireTool} from "../paths.mjs";
import {assert} from "../../contracts/assertions.mjs";
import {matchesWhen} from "../../contracts/conditions.mjs";

// Execute project code only inside the same sandboxed browser boundary as the workbench.
export async function validatePreview(built,candidate,{signal}={}) {
  const {chromium}=requireTool("playwright");
  const browser=await chromium.launch({channel:"chrome",headless:true});
  const abort=()=>void browser.close();signal?.addEventListener("abort",abort,{once:true});
  try {
    assert(!signal?.aborted,"生成已取消");const page=await browser.newPage({viewport:{width:built.data.manifest.viewports[0].width,height:built.data.manifest.viewports[0].height}}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    for(const scenario of built.data.scenarios){
      const config={scenario,candidate,page:scenario.page,pages:built.data.manifest.pages.map(p=>p.id),navigation:built.data.manifest.navigation,session:"validate",spec:built.data.specs[candidate+":"+scenario.page],css:built.data.params[candidate].css,pick:false};
      await page.setContent('<!doctype html><html><body><iframe sandbox="allow-scripts allow-downloads"></iframe></body></html>');
      await page.evaluate(({html,config})=>{const iframe=document.querySelector("iframe");window.__dhValidation={ids:[],error:"",state:{}};window.onmessage=event=>{if(event.source!==iframe.contentWindow)return;if(event.data?.type==="dh:mounted")iframe.contentWindow.postMessage({type:"dh:config",config},"*");if(event.data?.type==="dh:error"&&event.data.error)window.__dhValidation.error=event.data.error;if(event.data?.type==="dh:context")window.__dhValidation.state=event.data.context.state;if(event.data?.type==="dh:elements")window.__dhValidation.ids=event.data.ids;};iframe.srcdoc=html;},{html:built.payload.previews[candidate],config});
      await page.waitForFunction(()=>window.__dhValidation.error||window.__dhValidation.ids.length,{},{timeout:10000});
      await page.waitForTimeout(100);const result=await page.evaluate(()=>window.__dhValidation);assert(!result.error,"生成预览校验失败："+result.error);assert(!errors.length,"生成组件运行失败："+errors.join("；"));
      for(const annotation of built.data.interactions.filter(a=>(a.page==="*"||a.page===scenario.page)&&matchesWhen(a.when,result.state)))assert(result.ids.includes(annotation.target),"生成结果丢失说明目标："+scenario.id+" / "+annotation.target);
    }
  }finally{signal?.removeEventListener("abort",abort);await browser.close();}
}
