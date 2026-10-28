import path from "node:path";
import {parseArgs} from "node:util";
import {assert} from "../contracts/assertions.mjs";
import {initialize,workspacePath,configureOrganization,projectOrganization,defaultDesign,createRequirement,cloneCandidate} from "../backend/services/workspace.mjs";
import {exportToFile} from "../backend/services/export.mjs";
import {checkWorkspace} from "../backend/services/preview.mjs";
export async function main(args=process.argv.slice(2)) {
  const {positionals,values}=parseArgs({args,allowPositionals:true,options:{project:{type:"string"},title:{type:"string"},port:{type:"string",default:"4173"},out:{type:"string"},example:{type:"boolean",default:false},mode:{type:"string"},primary:{type:"string"},separate:{type:"boolean",default:false},preview:{type:"boolean",default:false}}});const[action,id,from,next]=positionals;
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
  throw new Error("用法: init [--mode continuous|per-requirement] [--primary <主稿ID>] [--example] | organization [--mode <模式>] [--primary <主稿ID>] | new [id] [--separate|--preview] | clone <id> <原候选> <新候选> | serve [--port 4173] | check [id] | typecheck | deps | export [id] --out <文件.html>；资源命令使用 --project <项目或资源目录>");
}
