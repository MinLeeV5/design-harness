import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {randomBytes} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
import {SourceConflict} from "../../contracts/errors.mjs";
import {reviewKey,reviewId} from "../../contracts/reviews.mjs";

export async function captureReviewImage(capture,input){const directory=fs.mkdtempSync(path.join(os.tmpdir(),"dh-review-capture-"));try{const file=await capture({capture:input,directory,signal:new AbortController().signal});return fs.readFileSync(file);}finally{fs.rmSync(directory,{recursive:true,force:true});}}

// Reviews are project records, outside the design revision and proposal copies.
export function createReviewFiles(workspace){
  const root=fs.realpathSync(workspace);
  function location(id,candidate,create=false){
    const parts=["reviews",reviewKey(id),reviewKey(candidate)];let folder=root;
    for(const part of parts){folder=path.join(folder,part);if(!fs.existsSync(folder)){if(!create)return null;fs.mkdirSync(folder,{mode:0o700});}assert(!fs.lstatSync(folder).isSymbolicLink()&&fs.statSync(folder).isDirectory(),"批阅目录无效或包含软链接");}
    return folder;
  }
  function regular(file){assert(!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).isFile(),"批阅文件无效或包含软链接");assert(fs.statSync(file).size<=32000000,"批阅文件过大");return file;}
  function read(id,candidate){const folder=location(id,candidate),file=folder&&path.join(folder,"threads.json");if(!file||!fs.existsSync(file))return {version:0,threads:[]};const value=JSON.parse(fs.readFileSync(regular(file),"utf8"));assert(value.schemaVersion===1&&Number.isInteger(value.version)&&Array.isArray(value.threads),"批阅记录损坏，请保留文件并检查");return {version:value.version,threads:value.threads};}
  function mutate(id,candidate,expected,change){
    const current=read(id,candidate);if(expected!==undefined&&current.version!==expected)throw new SourceConflict("批阅已更新，已保留输入；请刷新批阅后重试");
    const next=structuredClone(current);change(next.threads);assert(next.threads.length<=10000,"批阅数量过多");next.version++;
    const folder=location(id,candidate,true),file=path.join(folder,"threads.json"),temp=path.join(folder,"write-"+randomBytes(16).toString("hex")+".tmp");
    if(fs.existsSync(file))regular(file);
    const serialized=JSON.stringify({schemaVersion:1,...next})+"\n";assert(Buffer.byteLength(serialized)<=32000000,"批阅记录过大，请保留现有记录");
    try{fs.writeFileSync(temp,serialized,{mode:0o600,flag:"wx"});fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}return next;
  }
  function image(id,candidate,thread){const folder=location(id,candidate);assert(folder,"批阅截图不存在");const file=path.join(folder,reviewId(thread)+".png");assert(fs.existsSync(file),"批阅截图不存在");return regular(file);}
  return {read,mutate,image,readImage:(id,candidate,thread)=>fs.readFileSync(image(id,candidate,thread)),removeImage:(id,candidate,thread)=>fs.rmSync(image(id,candidate,thread),{force:true}),
    saveImage(id,candidate,thread,bytes){assert(Buffer.isBuffer(bytes)&&bytes.length>8&&bytes.length<=32000000&&bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")),"批阅截图无效");const folder=location(id,candidate,true),file=path.join(folder,reviewId(thread)+".png");fs.writeFileSync(file,bytes,{flag:"wx",mode:0o600});return file;},
    updateOrigin(id,candidate,proposalId,state,ancestors=[]){const current=read(id,candidate);if(!current.threads.some(t=>(t.source.proposalId===proposalId&&t.source.state!==state)||(ancestors.includes(t.source.proposalId)&&(t.source.successor?.proposalId!==proposalId||t.source.successor?.state!==state))))return;
      mutate(id,candidate,current.version,threads=>{for(const thread of threads){if(thread.source.proposalId===proposalId)thread.source.state=state;if(ancestors.includes(thread.source.proposalId))thread.source.successor={proposalId,state};}});}
  };
}
