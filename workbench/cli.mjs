#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {assert} from "./lib/protocol.mjs";
import {initialize,workspacePath,createRequirement,cloneCandidate,exportToFile,checkWorkspace} from "./lib/workspace.mjs";
export async function main(args=process.argv.slice(2)) {
  const {positionals,values}=parseArgs({args,allowPositionals:true,options:{project:{type:"string"},title:{type:"string"},port:{type:"string",default:"4173"},out:{type:"string"},example:{type:"boolean",default:false}}});const[action,id,from,next]=positionals;
  if(action==="init")return initialize(path.resolve(values.project??process.cwd()),values);
  if(action==="typecheck"){const {typecheck}=await import("./lib/typecheck.mjs");return typecheck(values.project?workspacePath(path.resolve(values.project)):undefined);}
  const workspace=workspacePath(path.resolve(values.project??process.cwd()));
  if(action==="new")return {directory:createRequirement(workspace,id,values.title??id)};
  if(action==="clone")return {directory:cloneCandidate(workspace,id,from,next,values.title??next)};
  if(action==="deps")return (await import("./lib/dependencies.mjs")).installDependencies(workspace);
  if(action==="check")return checkWorkspace(workspace,id);
  if(action==="export"){assert(positionals.length===2,"export 仅接受需求 ID，输出位置使用 --out <文件.html>");return exportToFile(workspace,id,values.out);}
  if(action==="serve"){
    const {startServer}=await import("./lib/server.mjs"),service=await startServer(workspace,{port:Number(values.port)});console.log("Design Harness: "+service.origin);let closing=false;const close=()=>{if(!closing){closing=true;void service.close();}};process.once("SIGINT",close);process.once("SIGTERM",close);return;
  }
  throw new Error("用法: init [--example] | new <id> | clone <id> <原候选> <新候选> | serve [--port 4173] | check [id] | typecheck | deps | export <id> --out <文件.html>；资源命令使用 --project <项目或资源目录>");
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().then(result=>{if(result)console.log(JSON.stringify(result,null,2));}).catch(error=>{console.error(error.message);process.exitCode=1;});
