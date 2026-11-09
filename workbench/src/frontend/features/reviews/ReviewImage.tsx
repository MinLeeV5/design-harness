import {useEffect,useState} from "react";
import {createWorkbenchClient} from "../../api/workbench";
import type {ReviewThread} from "../../../contracts/types";

export function ReviewImage({thread,token,compact=false}:{thread:ReviewThread;token?:string;compact?:boolean}){
  const [url,setUrl]=useState(""),[error,setError]=useState("");
  useEffect(()=>{let active=true,object="";setUrl("");setError("");void createWorkbenchClient(token).reviewImage(thread.requirement,thread.candidate,thread.id).then(blob=>{if(active){object=URL.createObjectURL(blob);setUrl(object);}}).catch(()=>{if(active)setError("截图暂不可用，请重试查看");});return()=>{active=false;if(object)URL.revokeObjectURL(object);};},[thread.id,thread.requirement,thread.candidate,token]);
  const view=thread.anchor.view;
  return <figure className={"review-snapshot "+(compact?"compact":"")}><div className="review-snapshot-image" style={{aspectRatio:view.width+"/"+view.height}}>{url?<><img src={url} alt={"批阅时画面 · "+thread.page}/><span className="review-snapshot-point" style={{left:(view.x/view.width*100)+"%",top:(view.y/view.height*100)+"%"}} aria-label="原始批阅位置"/></>:<span>{error||"正在读取截图…"}</span>}</div>{url&&!compact&&<figcaption><a href={url} target="_blank" rel="noopener noreferrer">查看完整截图</a><span>{view.width} × {view.height}</span></figcaption>}</figure>;
}
