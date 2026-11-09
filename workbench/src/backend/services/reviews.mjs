import {randomBytes} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
import {SourceConflict} from "../../contracts/errors.mjs";
import {reviewKey,reviewId,reviewText,reviewAnchor} from "../../contracts/reviews.mjs";
import {createReviewFiles,captureReviewImage} from "../adapters/review-files.mjs";
import {loadRequirement} from "../adapters/resource-store.mjs";
import {captureDesignView} from "../adapters/design-capture.mjs";

export function createReviewService(workspace,{capture=captureDesignView}={}){
  const files=createReviewFiles(workspace),known=new Set();
  const uid=()=>randomBytes(16).toString("hex");
  function scope(id,candidate){reviewKey(id);reviewKey(candidate);const data=loadRequirement(workspace,id);assert(data.manifest.candidates.some(c=>c.id===candidate),"批阅方案不存在");return data;}
  function read(id,candidate){scope(id,candidate);const value=files.read(id,candidate),missing=source=>source?.state==="ready"&&!known.has(source.proposalId);if(value.threads.some(t=>missing(t.source)||missing(t.source.successor))){return files.mutate(id,candidate,value.version,threads=>{for(const t of threads){if(missing(t.source))t.source.state="unavailable";if(missing(t.source.successor))t.source.successor.state="unavailable";}});}return value;}
  function get(id,candidate,thread){reviewId(thread);const result=read(id,candidate).threads.find(t=>t.id===thread);assert(result&&result.requirement===id&&result.candidate===candidate,"批阅不存在或归属不匹配");return result;}
  return {read,get,
    image(id,candidate,thread){get(id,candidate,thread);return files.image(id,candidate,thread);},
    imageBytes(id,candidate,thread){get(id,candidate,thread);return files.readImage(id,candidate,thread);},
    async create(body,resolveSource){
      const data=scope(body.id,body.candidate);
      const text=reviewText(body.text),anchor=reviewAnchor(body.anchor);assert(Number.isInteger(body.expectedVersion)&&body.expectedVersion>=0,"批阅版本无效");
      assert(body.capture?.page===body.page&&body.capture.width===anchor.view.width&&body.capture.height===anchor.view.height,"批阅截图与落点画面不一致");
      const origin=body.proposalId?resolveSource(body.id,body.candidate,body.proposalId):{kind:"saved",revision:data.revision,state:"saved"};
      const pages=body.proposalId?(origin.pages??data.manifest.pages.map(p=>p.id)):data.manifest.pages.map(p=>p.id);assert(pages.includes(body.page),"批阅页面不存在");
      const source={kind:origin.kind,revision:origin.revision,state:origin.state,...(origin.proposalId?{proposalId:origin.proposalId}:{})};
      if(!body.proposalId&&body.designRevision!==data.revision)throw new SourceConflict("设计已更新，请重新选择批阅位置；输入仍保留");
      const id=uid();let image;
      try{
        const bytes=await captureReviewImage(capture,body.capture);
        if(body.proposalId)resolveSource(body.id,body.candidate,body.proposalId);else if(scope(body.id,body.candidate).revision!==source.revision)throw new SourceConflict("截图期间设计已更新，请重新选择批阅位置");
        const now=Date.now(),thread={id,requirement:body.id,candidate:body.candidate,page:body.page,text,anchor,source,resolved:false,createdAt:now,updatedAt:now,replies:[]};
        image=files.saveImage(body.id,body.candidate,id,bytes);
        const result=files.mutate(body.id,body.candidate,body.expectedVersion,threads=>threads.push(thread));if(source.proposalId)known.add(source.proposalId);return result;
      }catch(error){if(image)files.removeImage(body.id,body.candidate,id);throw error;}
    },
    change(body){get(body.id,body.candidate,body.thread);assert(Number.isInteger(body.expectedVersion),"批阅版本无效");assert(["reply","resolve","reopen"].includes(body.action),"未知批阅操作");const text=body.action==="reply"?reviewText(body.text):null;
      return files.mutate(body.id,body.candidate,body.expectedVersion,threads=>{const t=threads.find(t=>t.id===body.thread);assert(t,"批阅不存在");if(text)t.replies.push({id:uid(),text,createdAt:Date.now()});else t.resolved=body.action==="resolve";t.updatedAt=Date.now();});
    },
    origin(id,candidate,proposalId,state,ancestors=[]){if(state==="ready")known.add(proposalId);else known.delete(proposalId);files.updateOrigin(id,candidate,proposalId,state,ancestors);},
    context(id,candidate,ids){assert(Array.isArray(ids)&&ids.length<=100&&new Set(ids).size===ids.length,"批阅引用无效或过多");return ids.map(key=>({thread:get(id,candidate,key),image:files.image(id,candidate,key)}));}
  };
}
