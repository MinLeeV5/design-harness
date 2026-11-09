import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {spawn} from "node:child_process";
import {PLUGIN} from "../backend/paths.mjs";
import {parseCommand} from "./options.mjs";

const packageName=JSON.parse(fs.readFileSync(path.join(PLUGIN,"package.json"),"utf8")).name;

export function localCli(project) {
  let manifestFile;
  try { manifestFile=createRequire(path.join(path.resolve(project),"package.json")).resolve(packageName+"/package.json"); }
  catch(error) { if(error.code==="MODULE_NOT_FOUND")return null;throw error; }
  const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
  const bin=typeof manifest.bin==="string"?manifest.bin:manifest.bin?.["design-harness"];
  if(manifest.name!==packageName||!bin)throw new Error("项目中的 "+packageName+" 没有可用命令，请安装支持 CLI 的版本。");
  return fs.realpathSync(path.resolve(path.dirname(manifestFile),bin));
}

async function forward(entry,args) {
  const child=spawn(process.execPath,[entry,...args],{stdio:"inherit"});
  const interrupt=()=>child.kill("SIGINT"),terminate=()=>child.kill("SIGTERM");
  process.on("SIGINT",interrupt);process.on("SIGTERM",terminate);
  try {
    return await new Promise((resolve,reject)=>{
      child.once("error",reject);
      child.once("exit",(code,signal)=>resolve(code??(signal==="SIGINT"?130:signal==="SIGTERM"?143:1)));
    });
  } finally { process.off("SIGINT",interrupt);process.off("SIGTERM",terminate); }
}

export async function launch(args=process.argv.slice(2)) {
  const {values}=parseCommand(args,{strict:false}),entry=localCli(values.project??process.cwd());
  if(entry&&entry!==fs.realpathSync(path.join(PLUGIN,"workbench/cli.mjs"))) {
    process.exitCode=await forward(entry,args);
    return;
  }
  const {main}=await import("./main.mjs"),result=await main(args);
  if(result!==undefined)console.log(typeof result==="string"?result:JSON.stringify(result,null,2));
}
