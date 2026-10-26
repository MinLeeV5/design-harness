#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {createRequirement,upgradeRequirement,exportRelease,verifyRelease,checkWorkspace} from "./lib/workspace.mjs";

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export async function main(args=process.argv.slice(2)) {
  const {positionals,values}=parseArgs({args,allowPositionals:true,options:{title:{type:"string"},port:{type:"string",default:"4173"}}});
  const [action,id,version]=positionals;
  if(action==="new") return {directory:createRequirement(workspace,id,values.title??id)};
  if(action==="upgrade") return {directory:upgradeRequirement(workspace,id,version)};
  if(action==="check") return checkWorkspace(workspace,id);
  if(action==="export") return exportRelease(workspace,id,version);
  if(action==="verify") return verifyRelease(path.resolve(id));
  if(action==="serve") {
    const {startServer}=await import("./lib/server.mjs");
    const {origin,server}=await startServer(workspace,{port:Number(values.port)});
    console.log("Design Harness: "+origin);
    process.once("SIGINT",()=>server.close());process.once("SIGTERM",()=>server.close());
    return;
  }
  throw new Error("用法: new <id> [--title 标题] | serve [--port 4173] | check [id] | export <id> <v1> | upgrade <id> <new-id> | verify <交付目录>");
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(result=>{if(result)console.log(JSON.stringify(result,null,2));}).catch(error=>{console.error(error.message);process.exitCode=1;});
