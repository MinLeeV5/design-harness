import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {buildRequirement} from "./build.mjs";
import {loadProject,loadRequirement,listRequirements,resolveFile,applyValues,hash,assert} from "./protocol.mjs";
import {exportHtml} from "./workspace.mjs";
import {createLiveAgentRuntime} from "./live-agent.mjs";
export async function startServer(workspace,{port=4173,agentRun}={}) {
  workspace=fs.realpathSync(workspace);loadProject(workspace);const token=randomBytes(24).toString("hex"),agent=createLiveAgentRuntime(workspace,{run:agentRun});let origin="";
  const server=http.createServer(async(req,res)=>{
    const reply=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));};
    try {
      assert(req.headers.host===new URL(origin).host,"Host 不匹配");if(req.headers.origin)assert(req.headers.origin===origin,"Origin 不匹配");const url=new URL(req.url,origin);
      if(req.method==="GET"&&url.pathname==="/"){
        const id=url.searchParams.get("id")||listRequirements(workspace).find(item=>{try{loadRequirement(workspace,item.id);return true;}catch{return false;}})?.id;
        if(!id){res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});res.end("尚无需求，请从插件工具运行 new <需求ID> --project <项目>");return;}
        const {html}=await buildRequirement(workspace,id,{development:true,token});res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(html);return;
      }
      if(req.method==="GET"&&url.pathname==="/__dh/revision"){reply(200,{revision:loadRequirement(workspace,url.searchParams.get("id")).revision});return;}
      if(req.method==="GET"&&url.pathname==="/__dh/live/session"){if(req.headers["x-dh-token"]!==token){reply(403,{error:"会话需要当前工作台"});return;}reply(200,agent.session(url.searchParams.get("id"),url.searchParams.get("candidate")));return;}
      if(req.method==="GET"&&/^\/__dh\/live\/jobs\/[a-f0-9]{32}$/.test(url.pathname)){if(req.headers["x-dh-token"]!==token){reply(403,{error:"生成记录需要当前工作台"});return;}reply(200,agent.get(url.pathname.split("/").at(-1)));return;}
      if(req.method!=="POST"||!["/__dh/spec","/__dh/export","/__dh/live/events"].includes(url.pathname)){reply(404,{error:"入口不存在"});return;}
      if(req.headers.origin!==origin||req.headers["x-dh-token"]!==token){reply(403,{error:"写入需要当前本地工作台"});return;}
      let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;assert(length<=65536,"请求过大");chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if(url.pathname==="/__dh/live/events"){reply(200,await agent.event(body));return;}
      if(url.pathname==="/__dh/export"){const {html,filename}=await exportHtml(workspace,body.id);res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Disposition":'attachment; filename="'+filename+'"',"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(html);return;}
      const data=loadRequirement(workspace,body.id),key=body.candidate+":"+body.page;assert(data.specFiles[key],"页面或候选不存在");const file=data.specFiles[key],before=fs.readFileSync(file);
      if(hash(before)!==body.expectedHash){reply(409,{error:"页面 Spec 已被其他编辑修改；未保存草稿已保留，请重新比较"});return;}
      const spec=applyValues(data.manifest,body.page,data.specs[key],body.values),bytes=JSON.stringify(spec,null,2)+"\n",temp=file+"."+randomBytes(6).toString("hex")+".tmp";
      try{fs.writeFileSync(temp,bytes,{flag:"wx"});assert(hash(fs.readFileSync(file))===body.expectedHash,"保存前源文件已变化");fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
      reply(200,{hash:hash(bytes),spec,beforeRevision:data.revision,revision:loadRequirement(workspace,body.id).revision});
    }catch(error){reply(400,{error:error.message});}
  });
  server.once("close",()=>void agent.close());
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});origin="http://127.0.0.1:"+server.address().port;return {server,origin,close:async()=>{await agent.close();return new Promise(resolve=>server.close(resolve));}};
}
