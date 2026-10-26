#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {spawnSync} from "node:child_process";
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export function initialize(project,{example=false}={}) {
  const parent=fs.realpathSync(project),target=path.join(parent,"design-harness");
  if(fs.existsSync(target))throw new Error("design-harness 已存在，拒绝覆盖；请读取现有工作区");
  fs.mkdirSync(target);
  try {
    fs.cpSync(path.join(base,"assets","workspace"),target,{recursive:true});
    fs.mkdirSync(path.join(target,"requirements"),{recursive:true});
    fs.mkdirSync(path.join(target,"releases"),{recursive:true});
    if(example) {
      const result=spawnSync(process.execPath,[path.join(target,"studio","cli.mjs"),"new","example","--title","资料整理 · 设计示例"],{encoding:"utf8"});
      if(result.status!==0)throw new Error(result.stderr);
    }
    return {workspace:target,next:"在工作区运行 npm ci，然后 npm run dev；Init 仍需核对项目事实并修订设计基础"};
  } catch(error){fs.rmSync(target,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {positionals,values}=parseArgs({allowPositionals:true,options:{project:{type:"string",default:process.cwd()},example:{type:"boolean",default:false}}});
    if(positionals[0]!=="init")throw new Error("用法: node scripts/harness.mjs init --project <项目目录> [--example]");
    console.log(JSON.stringify(initialize(path.resolve(values.project),values),null,2));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
