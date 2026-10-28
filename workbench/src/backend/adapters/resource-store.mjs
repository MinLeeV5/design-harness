import fs from "node:fs";
import path from "node:path";
import {TOOL,PLUGIN} from "../paths.mjs";
import {parseInteractionDocument} from "./interaction-docs.mjs";
import {assert,safeId} from "../../contracts/assertions.mjs";
import {unique,checkSpec,pageControls,validValue} from "../../contracts/resources.mjs";
import {readJson,hash,inside,resolveFile,filesIn,resourceFiles} from "./filesystem.mjs";
export function loadProject(workspace) {
  const project=readJson(resolveFile(workspace,"project.json"));
  assert(project.schemaVersion===1 && project.renderer==="json-render/react" && typeof project.name==="string","项目资源协议不受支持");
  return project;
}
export function requirementRoot(workspace,id) {
  loadProject(workspace);assert(safeId(id),"需求 ID 无效");
  const folder=path.join(workspace,"requirements",id);
  assert(fs.existsSync(folder) && fs.realpathSync(folder)===path.resolve(folder),"需求目录不存在或包含软链接: "+id);
  return folder;
}
export function loadRequirement(workspace,id) {
  const folder=requirementRoot(workspace,id);const manifest=readJson(resolveFile(folder,"manifest.json"));
  assert(manifest.schemaVersion===1&&manifest.renderer==="json-render/react"&&manifest.id===id&&typeof manifest.title==="string"&&manifest.title.trim(),"需求协议或 ID 不匹配");
  const pages=unique(manifest.pages,"页面");unique(manifest.candidates,"候选");unique(manifest.viewports,"视口");
  if(manifest.navigation!==undefined)assert(manifest.navigation&&typeof manifest.navigation==="object"&&Object.keys(manifest.navigation).every(key=>key==="pageStatePath")&&/^\/(?:[^~\/]|~[01])+(?:\/(?:[^~\/]|~[01])+)*$/.test(manifest.navigation.pageStatePath),"navigation 需要合法 pageStatePath");
  const foundationRoot=path.join(workspace,"foundation"),foundation=readJson(resolveFile(foundationRoot,"foundation.json"));assert(foundation.schemaVersion===1&&typeof foundation.version==="string","公共设计基础无效");manifest.foundationVersion=foundation.version;manifest.foundation="shared";
  assert(Array.isArray(manifest.controls),"缺少 controls 数组");const controls=new Set();
  for(const c of manifest.controls) {
    assert(safeId(c.id)&&!controls.has(c.id)&&pages.has(c.page)&&safeId(c.target)&&typeof c.label==="string"&&c.label&&["range","text","boolean"].includes(c.type),"非法调参定义: "+c.id);
    assert(typeof c.property==="string"&&/^[a-zA-Z][a-zA-Z0-9]*$/.test(c.property)&&!["constructor","prototype","__proto__"].includes(c.property),"非法属性路径");
    if(c.type==="range")assert([c.min,c.max,c.step].every(Number.isFinite)&&c.min<c.max&&c.step>0,"非法范围参数");
    if(c.maxLength!==undefined)assert(Number.isInteger(c.maxLength)&&c.maxLength>0&&c.maxLength<=10000,"非法文本限制");controls.add(c.id);
  }
  for(const v of manifest.viewports)assert([v.width,v.height].every(n=>Number.isInteger(n)&&n>=320&&n<=3840),"非法视口尺寸");
  const specs={},hashes={},params={},specFiles={},candidateRoots={},used=new Set();
  for(const c of manifest.candidates) {
    const dir=path.join(folder,"candidates",c.id);candidateRoots[c.id]=dir;
    assert(fs.existsSync(dir)&&fs.realpathSync(dir)===dir,"候选资源必须独立且不含软链接");
    assert(c.pages&&Object.keys(c.pages).length===pages.size&&Object.keys(c.pages).every(p=>pages.has(p)),"候选必须提供全部页面 Spec");
    for(const relative of [c.registry,c.params,...Object.values(c.pages)])assert(inside(dir,resolveFile(folder,relative)),"候选资源必须保存在自己的目录: "+relative);
    params[c.id]=readJson(resolveFile(folder,c.params));assert(params[c.id]&&params[c.id].css&&typeof params[c.id].css==="object"&&!Array.isArray(params[c.id].css),"候选参数需包含 css 对象");
    for(const [name,value] of Object.entries(params[c.id].css))assert(/^--[a-z][a-z0-9-]*$/.test(name)&&typeof value==="string"&&value.length<1024,"非法候选样式参数");
    for(const page of pages) {
      const key=c.id+":"+page,file=resolveFile(folder,c.pages[page]);assert(!used.has(file),"候选页面 Spec 必须独立");used.add(file);
      specs[key]=checkSpec(readJson(file),key);hashes[key]=hash(fs.readFileSync(file));specFiles[key]=file;
      for(const control of pageControls(manifest,page)) {const e=specs[key].elements[control.target];assert(e&&Object.hasOwn(e.props,control.property)&&validValue(control,e.props[control.property]),"调参必须关联可编辑的字面量实例属性: "+control.id);}
    }
  }
  const documentation=fs.readFileSync(resolveFile(folder,"requirement.md"),"utf8");
  const docFiles=resourceFiles(folder).filter(file=>file.startsWith(path.join(folder,"interactions")+path.sep)&&file.endsWith(".md"));
  assert(docFiles.length,"缺少独立交互文档 interactions/*.md");
  const interactions=docFiles.flatMap(file=>parseInteractionDocument(fs.readFileSync(resolveFile(folder,path.relative(folder,file)),"utf8"),{file:path.relative(folder,file).split(path.sep).join("/"),pages}));
  assert(new Set(interactions.map(item=>item.id)).size===interactions.length,"交互说明 ID 必须在需求内唯一");
  for(const item of interactions)for(const candidate of manifest.candidates)for(const page of pages)if(item.page==="*"||item.page===page)assert(specs[candidate.id+":"+page].elements[item.target.split("/")[0]],"交互说明目标不在页面 Spec 中："+item.id+" / "+candidate.id+":"+page);
  const scenarios=readJson(resolveFile(folder,"scenarios.json"));unique(scenarios,"场景");
  for(const s of scenarios) {
    assert(pages.has(s.page)&&s.state&&typeof s.state==="object"&&!Array.isArray(s.state),"非法场景: "+s.id);
    assert(!Object.hasOwn(s,"annotations"),"场景只保存体验初始状态；请将 annotations 迁移到 interactions/*.md："+s.id);
  }
  for(const page of pages)assert(scenarios.some(s=>s.page===page),"页面缺少场景: "+page);
  const inputs=[...resourceFiles(folder),...filesIn(foundationRoot),resolveFile(workspace,"project.json"),...filesIn(TOOL),path.join(PLUGIN,"package-lock.json")];
  for(const name of ["package.json","dependencies.lock.json"])if(fs.existsSync(path.join(workspace,name)))inputs.push(resolveFile(workspace,name));
  const revision=hash(Buffer.concat(inputs.flatMap(file=>[Buffer.from(inside(folder,file)?path.relative(folder,file):inside(foundationRoot,file)?"foundation/"+path.relative(foundationRoot,file):inside(TOOL,file)?"tool/"+path.relative(TOOL,file):path.basename(file)),fs.readFileSync(file)])));
  return {folder,foundationRoot,manifest,scenarios,documentation,interactions,specs,hashes,params,specFiles,candidateRoots,revision};
}
export function listRequirements(workspace) {
  loadProject(workspace);const directory=path.join(workspace,"requirements");if(!fs.existsSync(directory))return [];
  assert(fs.realpathSync(directory)===path.resolve(directory),"需求目录不允许软链接");
  return fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()&&safeId(e.name)).map(e=>{
    try {const m=readJson(resolveFile(path.join(directory,e.name),"manifest.json"));return {id:e.name,title:typeof m.title==="string"?m.title:e.name};}catch{return {id:e.name,title:e.name+"（草稿待修复）"};}
  });
}
