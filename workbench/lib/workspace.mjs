import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {assert,safeId,readJson,filesIn,loadProject,loadRequirement,inside} from "./protocol.mjs";
import {TOOL,PLUGIN} from "./paths.mjs";
export function workspacePath(project) {
  const root=fs.realpathSync(project),entry=path.join(root,"project.json");
  if(fs.existsSync(entry)){try{const config=readJson(entry);if(config.schemaVersion===1&&config.renderer==="json-render/react"&&typeof config.name==="string")return root;}catch{/* 业务工程可有自己的 project.json。 */}}
  if(fs.existsSync(path.join(root,"design-harness","project.json")))return path.join(root,"design-harness");
  return fs.existsSync(path.join(root,"foundation"))&&fs.existsSync(path.join(root,"requirements"))?root:path.join(root,"design-harness");
}
export function initialize(project,{example=false}={}) {
  const parent=fs.realpathSync(project),target=path.join(parent,"design-harness");assert(!fs.existsSync(target),"design-harness 已存在，拒绝覆盖");fs.mkdirSync(target);
  try {
    const source=path.join(PLUGIN,"shared/workspace");assert(fs.existsSync(source),"缺少插件公共业务模板；请安装完整 Design Harness 插件");filesIn(source);fs.cpSync(source,target,{recursive:true});
    for(const name of ["requirements","reviews"])fs.mkdirSync(path.join(target,name),{recursive:true});
    if(example)createRequirement(target,"example","资料整理 · 设计示例");
    return {workspace:target,next:"从插件运行 node workbench/cli.mjs serve --project <项目目录>；Init 仍需核对事实并修订基础"};
  }catch(error){fs.rmSync(target,{recursive:true,force:true});throw error;}
}
export function createRequirement(workspace,id,title=id) {
  loadProject(workspace);assert(safeId(id),"需求 ID 无效");const folder=path.join(workspace,"requirements",id);
  assert(!fs.existsSync(folder),"需求已存在，拒绝覆盖: "+id);fs.mkdirSync(path.dirname(folder),{recursive:true});assert(fs.realpathSync(path.dirname(folder))===path.resolve(path.dirname(folder)),"需求目录不允许软链接");fs.mkdirSync(folder);
  try {
    const source=path.join(TOOL,"starter");filesIn(source);filesIn(path.join(workspace,"foundation"));fs.cpSync(source,folder,{recursive:true});
    const manifest=readJson(path.join(folder,"manifest.json"));manifest.id=id;manifest.title=title;delete manifest.foundationVersion;manifest.foundation="shared";
    fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");loadRequirement(workspace,id);
  }catch(error){fs.rmSync(folder,{recursive:true,force:true});throw error;}return folder;
}
export function cloneCandidate(workspace,id,fromId,nextId,title=nextId) {
  const data=loadRequirement(workspace,id);assert(safeId(nextId)&&!data.manifest.candidates.some(c=>c.id===nextId),"候选 ID 无效或已存在");const source=data.manifest.candidates.find(c=>c.id===fromId);assert(source,"原候选不存在");
  const next=path.join(data.folder,"candidates",nextId),file=path.join(data.folder,"manifest.json"),before=fs.readFileSync(file);
  assert(!fs.existsSync(next),"候选目录已存在，拒绝覆盖");fs.mkdirSync(next);
  try {
    fs.cpSync(data.candidateRoots[fromId],next,{recursive:true});const prefix="candidates/"+fromId+"/",replace=value=>"candidates/"+nextId+"/"+value.slice(prefix.length);
    const candidate={id:nextId,title,registry:replace(source.registry),params:replace(source.params),pages:Object.fromEntries(Object.entries(source.pages).map(([key,value])=>[key,replace(value)]))};
    data.manifest.candidates.push(candidate);fs.writeFileSync(file,JSON.stringify(data.manifest,null,2)+"\n");loadRequirement(workspace,id);
  }catch(error){fs.writeFileSync(file,before);fs.rmSync(next,{recursive:true,force:true});throw error;}return next;
}
/** Build one downloadable HTML from the current requirement; no project files are created. */
export async function exportHtml(workspace,id) {
  workspace=fs.realpathSync(workspace);const {buildRequirement}=await import("./build.mjs"),{html,data}=await buildRequirement(workspace,id);
  assert(loadRequirement(workspace,id).revision===data.revision,"导出期间设计资源已变化，请重新导出");
  return {html,filename:id+".html"};
}
/** The CLI writes only to an explicitly selected file outside the resource tree. */
export async function exportToFile(workspace,id,output) {
  assert(typeof output==="string"&&output,"请用 --out 指定资源目录之外的 HTML 文件");
  const requested=path.resolve(output);assert(path.extname(requested).toLowerCase()===".html","导出文件需要 .html 扩展名");
  const file=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
  assert(!inside(fs.realpathSync(workspace),file),"请将 HTML 导出到 design-harness 资源目录之外");
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});assert(!stat||stat.isFile()&&!stat.isSymbolicLink(),"导出目标必须是普通文件，不能是目录或软链接");
  const {html}=await exportHtml(workspace,id),pending=file+"."+randomBytes(8).toString("hex")+".tmp";
  try{fs.writeFileSync(pending,html,{flag:"wx"});fs.renameSync(pending,file);}finally{fs.rmSync(pending,{force:true});}
  return {file,bytes:Buffer.byteLength(html)};
}
export async function checkWorkspace(workspace,id){return (await import("./build.mjs")).checkWorkspace(workspace,id);}
