import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {buildRequirement} from "./build.mjs";
import {loadRequirement,listRequirements,resolveFile,validateValues,hash,assert} from "./protocol.mjs";
import {exportRelease} from "./workspace.mjs";
export async function startServer(workspace,{port=4173}={}) {
  const token=randomBytes(24).toString("hex");
  let origin="";
  const server=http.createServer(async(req,res)=>{
    const reply=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));};
    try {
      assert(req.headers.host===new URL(origin).host,"Host 不匹配");
      if(req.headers.origin) assert(req.headers.origin===origin,"Origin 不匹配");
      const url=new URL(req.url,origin);
      if(req.method==="GET" && url.pathname==="/") {
        const id=url.searchParams.get("id")||listRequirements(workspace).find(item=>{
          try {loadRequirement(workspace,item.id);return true;} catch {return false;}
        })?.id;
        if(!id) {res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});res.end("尚无需求，请先运行 npm run new -- <需求ID>");return;}
        const {html}=await buildRequirement(workspace,id,{development:true,token});
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(html);return;
      }
      if(req.method==="GET" && url.pathname==="/__dh/revision") {
        reply(200,{revision:loadRequirement(workspace,url.searchParams.get("id")).revision});return;
      }
      if(req.method==="GET" && /^\/releases\/[a-z][a-z0-9-]*\/v[1-9]\d*(?:\.\d+){0,2}\/index\.html$/.test(url.pathname)) {
        const html=fs.readFileSync(resolveFile(workspace,url.pathname.slice(1)));
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(html);return;
      }
      if(req.method!=="POST" || !["/__dh/params","/__dh/export"].includes(url.pathname)){reply(404,{error:"入口不存在"});return;}
      if(req.headers.origin!==origin || req.headers["x-dh-token"]!==token){reply(403,{error:"写入需要当前本地工作台"});return;}
      let length=0;const chunks=[];
      for await(const chunk of req) {length+=chunk.length;assert(length<=65536,"请求过大");chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if(url.pathname==="/__dh/export") {reply(200,await exportRelease(workspace,body.id,body.version));return;}
      const {folder,manifest}=loadRequirement(workspace,body.id);
      const candidate=manifest.candidates.find(c=>c.id===body.candidate);
      assert(candidate,"候选不存在");validateValues(manifest,body.values);
      const file=resolveFile(folder,candidate.params),before=fs.readFileSync(file);
      if(hash(before)!==body.expectedHash){reply(409,{error:"候选已被其他编辑修改，请刷新后重新比较"});return;}
      const bytes=JSON.stringify(body.values,null,2)+"\n";
      const temp=file+"."+randomBytes(6).toString("hex")+".tmp";
      try {fs.writeFileSync(temp,bytes,{flag:"wx"});fs.renameSync(temp,file);}
      finally {fs.rmSync(temp,{force:true});}
      reply(200,{hash:hash(bytes)});
    } catch(error) {reply(400,{error:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});
  origin="http://127.0.0.1:"+server.address().port;
  return {server,origin,close:()=>new Promise(resolve=>server.close(resolve))};
}
