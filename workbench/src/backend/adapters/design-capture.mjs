import fs from "node:fs";
import path from "node:path";
import {requireTool} from "../paths.mjs";
import {assert} from "../../contracts/assertions.mjs";

export async function captureDesignView({capture,directory,signal}) {
  assert(capture&&typeof capture.html==="string"&&capture.html.length>0&&Buffer.byteLength(capture.html)<=2200000,"当前画面快照无效或过大");
  assert([capture.width,capture.height].every(value=>Number.isInteger(value)&&value>=320&&value<=3840),"当前画面尺寸无效");
  const {chromium}=requireTool("playwright"),browser=await chromium.launch({channel:"chrome",headless:true});
  const abort=()=>void browser.close();signal.addEventListener("abort",abort,{once:true});
  try{
    assert(!signal.aborted,"生成已取消");const page=await browser.newPage({viewport:{width:capture.width,height:capture.height}});await page.route("**/*",route=>route.abort());
    await page.setContent('<!doctype html><html><body style="margin:0"><iframe sandbox="" style="border:0;display:block;width:100vw;height:100vh"></iframe></body></html>');
    const policy="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'\">";
    await page.evaluate(({html,policy})=>{const parsed=new DOMParser().parseFromString(html,"text/html");parsed.querySelectorAll("script,iframe,object,embed,base,link,meta").forEach(node=>node.remove());parsed.documentElement.setAttribute("data-dh-screenshot","ready");parsed.head.insertAdjacentHTML("afterbegin",policy);document.querySelector("iframe").srcdoc='<!doctype html>'+parsed.documentElement.outerHTML;},{html:capture.html,policy});
    const frame=page.frames().find(frame=>frame.parentFrame());await frame.waitForFunction(()=>document.documentElement.getAttribute("data-dh-screenshot")==="ready");
    await frame.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));for(const dialog of document.querySelectorAll('dialog[data-dh-capture-modal]')){dialog.removeAttribute("open");dialog.showModal();}for(const element of document.querySelectorAll('[data-dh-capture-popover]'))element.showPopover();for(const el of document.querySelectorAll("[data-dh-capture-top],[data-dh-capture-left]")){el.scrollTop=Number(el.getAttribute("data-dh-capture-top")??0);el.scrollLeft=Number(el.getAttribute("data-dh-capture-left")??0);}scrollTo(Number(document.documentElement.getAttribute("data-dh-capture-scroll-x")??0),Number(document.documentElement.getAttribute("data-dh-capture-scroll-y")??0));});
    const file=path.join(directory,"current-view.png");await page.screenshot({path:file,type:"png",animations:"disabled"});return file;
  }finally{signal.removeEventListener("abort",abort);await browser.close();}
}

export function saveDesignReferences(references,directory) {
  assert(references===undefined||Array.isArray(references)&&references.length<=3,"最多附加3张设计参考图");
  return (references??[]).map((reference,index)=>{
    assert(reference&&typeof reference.name==="string"&&reference.name.length<=160&&typeof reference.data==="string","参考图无效");
    const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(reference.data);assert(match,"参考图只支持 PNG、JPEG 或 WebP");
    const bytes=Buffer.from(match[2],"base64");assert(bytes.length>0&&bytes.length<=3000000,"每张参考图最大3MB");
    const valid=match[1]==="png"?bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")):match[1]==="jpeg"?bytes[0]===255&&bytes[1]===216:bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";assert(valid,"参考图格式与内容不符");
    const file=path.join(directory,"reference-"+index+"."+match[1]);fs.writeFileSync(file,bytes);return file;
  });
}
