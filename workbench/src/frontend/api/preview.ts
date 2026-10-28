import type {CanvasCapture} from "../../contracts/types";

export function captureFrame(frame:HTMLIFrameElement,page:string,state:Record<string,unknown>):Promise<CanvasCapture> {
  return new Promise((resolve,reject)=>{
    const serial=crypto.randomUUID(),timer=setTimeout(()=>{stop();reject(new Error("无法读取当前画面，请等待页面加载后重试"));},6000);
    const stop=()=>{clearTimeout(timer);window.removeEventListener("message",receive);};
    const receive=(event:MessageEvent)=>{if(event.source!==frame.contentWindow||event.data?.type!=="dh:capture-result"||event.data.serial!==serial)return;stop();if(event.data.error){reject(new Error(event.data.error));return;}resolve({html:event.data.html,width:frame.clientWidth,height:frame.clientHeight,page,state});};
    window.addEventListener("message",receive);frame.contentWindow?.postMessage({type:"dh:capture",serial},"*");
  });
}
