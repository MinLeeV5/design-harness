#!/usr/bin/env node
// The complete plugin owns the workbench; projects receive business resources only.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const tool=path.resolve(import.meta.dirname,"../../../workbench/cli.mjs");
if(!fs.existsSync(tool))throw new Error("缺少插件固定工作台；请安装完整 Design Harness 插件，不能单独复制此 Skill 运行");
export const initialize=(await import(path.resolve(import.meta.dirname,"../../../workbench/lib/workspace.mjs"))).initialize;
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  (await import(tool)).main().then(result=>{if(result)console.log(JSON.stringify(result,null,2));}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
