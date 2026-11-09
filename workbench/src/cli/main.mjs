import fs from "node:fs";
import path from "node:path";
import {parseCommand} from "./options.mjs";
import {assert} from "../contracts/assertions.mjs";
import {initialize,workspacePath,configureOrganization,projectOrganization,defaultDesign,createRequirement,cloneCandidate} from "../backend/services/workspace.mjs";
import {exportToFile} from "../backend/services/export.mjs";
import {checkWorkspace} from "../backend/services/preview.mjs";
import {PLUGIN} from "../backend/paths.mjs";

const usage=`Design Harness — 本地产品设计工作台

用法: design-harness <命令> [选项]

  init [--mode continuous|per-requirement] [--primary <主稿ID>] [--example]
  organization [--mode <模式>] [--primary <主稿ID>]
  new [id] [--title <名称>] [--separate|--preview]
  clone <id> <原候选> <新候选> [--title <名称>]
  serve [--port 4173]          启动工作台，Agent 复用本机 Codex
  check [id]                 检查设计资源与构建
  typecheck                  检查工具及指定项目的类型
  deps                       安装设计资源声明的扩展依赖
  export [id] --out <文件.html>
  skills [product|init|interaction|visual|implement]  定位专业流程与公共指导
  doctor                     读取本机 Codex 连接状态

资源命令使用 --project <项目或资源目录>，默认当前目录。
项目本地安装的版本优先于全局或插件版本。
--help, -h 显示帮助；--version, -v 显示版本。`;

export async function main(args=process.argv.slice(2)) {
  const {positionals,values}=parseCommand(args),[action,id,from,next]=positionals;
  const manifest=JSON.parse(fs.readFileSync(path.join(PLUGIN,"package.json"),"utf8"));
  if(values.version)return manifest.version;
  if(values.help||!action||action==="help")return usage;
  if(action==="skills") {
    const phases=["product","init","interaction","visual","implement"],phase=id?.replace(/^design-harness-/,"");
    assert(positionals.length<=2&&(!phase||phases.includes(phase)),"skills 仅接受 product、init、interaction、visual 或 implement");
    return {version:manifest.version,shared:path.join(PLUGIN,"shared/references"),skills:(phase?[phase]:phases).map(name=>({name:"design-harness-"+name,entry:path.join(PLUGIN,"skills/design-harness-"+name+"/SKILL.md")}))};
  }
  if(action==="doctor") {
    const {createCodexConnection}=await import("../backend/adapters/codex-connection.mjs"),connection=createCodexConnection();
    try { return {version:manifest.version,packageRoot:PLUGIN,node:process.version,codex:await connection.read()}; }
    finally { await connection.close(); }
  }
  assert(["init","typecheck","organization","new","clone","deps","check","export","serve"].includes(action),"未知命令: "+action+"\n\n"+usage);
  if(action==="init")return initialize(path.resolve(values.project??process.cwd()),values);
  if(action==="typecheck"){const {typecheck}=await import("../backend/adapters/typecheck.mjs");return typecheck(values.project?workspacePath(path.resolve(values.project)):undefined);}
  const workspace=workspacePath(path.resolve(values.project??process.cwd()));
  if(action==="organization") {
    assert(positionals.length===1,"organization 使用 --mode 与 --primary，不接受额外位置参数");
    assert(values.mode!==undefined||values.primary===undefined,"修改主稿时需要显式指定 --mode continuous");
    return {designOrganization:values.mode===undefined?projectOrganization(workspace):configureOrganization(workspace,values)};
  }
  if(action==="new"){const target=defaultDesign(workspace,id);return {directory:createRequirement(workspace,target,values.title??target,values)};}
  if(action==="clone")return {directory:cloneCandidate(workspace,id,from,next,values.title??next)};
  if(action==="deps")return (await import("../backend/adapters/dependencies.mjs")).installDependencies(workspace);
  if(action==="check")return checkWorkspace(workspace,id);
  if(action==="export"){assert(positionals.length<=2,"export 仅接受需求 ID，输出位置使用 --out <文件.html>");return exportToFile(workspace,defaultDesign(workspace,id),values.out);}
  if(action==="serve"){
    const {startServer}=await import("../backend/http/server.mjs"),project=path.resolve(values.project??process.cwd()),service=await startServer(workspace,{port:Number(values.port),projectRoot:project===workspace?undefined:project});console.log("Design Harness: "+service.origin);let closing=false;const close=()=>{if(!closing){closing=true;void service.close();}};process.once("SIGINT",close);process.once("SIGTERM",close);return;
  }
}
