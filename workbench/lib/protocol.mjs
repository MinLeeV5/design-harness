import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {validateSpec} from "@json-render/core";
import {TOOL,PLUGIN} from "./paths.mjs";
import {parseInteractionDocument} from "./interaction-docs.mjs";
export const readJson = file => JSON.parse(fs.readFileSync(file,"utf8"));
export const hash = data => createHash("sha256").update(data).digest("hex");
export const inside = (base,file) => file===base || file.startsWith(base+path.sep);
export const safeId = value => typeof value==="string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
export const assert = (value,message) => {if(!value)throw new Error(message);};
export function resolveFile(base,relative) {
  assert(typeof relative==="string" && relative && !path.isAbsolute(relative) && !relative.includes("\\") && !relative.split("/").some(part=>["..","node_modules",".cache",".git"].includes(part)),"非法相对路径: "+relative);
  const root=fs.realpathSync(base),file=path.resolve(root,relative);
  assert(inside(root,file) && fs.existsSync(file),"资源不存在: "+relative);
  const real=fs.realpathSync(file);
  assert(real===file && inside(root,real) && fs.statSync(real).isFile(),"资源越界、软链接或不是文件: "+relative);
  return real;
}
export function filesIn(base) {
  const result=[];
  function walk(dir) {
    for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,"en"))) {
      if(["node_modules",".cache",".git"].includes(item.name))continue;
      const file=path.join(dir,item.name);assert(!item.isSymbolicLink(),"不允许软链接资源: "+file);
      if(item.isDirectory())walk(file);else if(item.isFile())result.push(file);
    }
  }
  walk(base);return result;
}
export const resourceFiles = folder => filesIn(folder).filter(file=>!["foundation","evidence","verification","reviews"].includes(path.relative(folder,file).split(path.sep)[0])&&!/\.(log|tmp)$/.test(file));
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
function unique(items,label) {
  assert(Array.isArray(items)&&items.length>0,label+"不能为空");const ids=new Set();
  for(const item of items) {assert(safeId(item.id)&&!ids.has(item.id),label+" ID 无效或重复: "+item.id);assert(typeof item.title==="string"&&item.title.trim(),label+"缺少标题");ids.add(item.id);}
  return ids;
}
export function checkSpec(spec,label="Spec") {
  assert(spec && typeof spec==="object" && !Array.isArray(spec) && safeId(spec.root) && spec.elements && typeof spec.elements==="object" && !Array.isArray(spec.elements),"非法页面 Spec: "+label);
  for(const [id,e] of Object.entries(spec.elements))assert(safeId(id)&&e&&typeof e.type==="string"&&e.props&&typeof e.props==="object"&&!Array.isArray(e.props)&&Array.isArray(e.children),"非法 Spec 元素: "+id);
  const ids=Object.keys(spec.elements);assert(ids.length<=10000,"Spec 元素过多");
  const active=new Set(),done=new Set();
  function visit(id,depth=0){assert(depth<128,"Spec 层级过深");assert(!active.has(id),"Spec 子节点循环: "+id);if(done.has(id))return;const e=spec.elements[id];assert(e,"Spec 子节点不存在: "+id);active.add(id);for(const child of [...e.children,...Object.values(e.slots??{}).flat()])visit(child,depth+1);active.delete(id);done.add(id);}
  for(const id of ids)visit(id);
  const issues=validateSpec(spec);assert(issues.valid,"Spec 引用或结构无效: "+label+" "+JSON.stringify(issues));return spec;
}
export const pageControls = (manifest,page) => manifest.controls.filter(c=>c.page===page);
export const valuesFromSpec = (manifest,page,spec) => Object.fromEntries(pageControls(manifest,page).map(c=>[c.id,spec.elements[c.target].props[c.property]]));
function validValue(c,value) {
  if(c.type==="range")return typeof value==="number"&&Number.isFinite(value)&&value>=c.min&&value<=c.max&&Math.abs((value-c.min)/c.step-Math.round((value-c.min)/c.step))<1e-7;
  if(c.type==="text")return typeof value==="string"&&value.length<=(c.maxLength??2000);
  return typeof value==="boolean";
}
export function validateValues(manifest,values,page) {
  assert(values&&typeof values==="object"&&!Array.isArray(values),"非法实例属性");const controls=new Map(pageControls(manifest,page).map(c=>[c.id,c]));
  for(const [id,value] of Object.entries(values))assert(controls.has(id)&&validValue(controls.get(id),value),"非法实例属性: "+id);
}
export function applyValues(manifest,page,spec,values) {
  validateValues(manifest,values,page);const next=structuredClone(spec);
  for(const c of pageControls(manifest,page))if(Object.hasOwn(values,c.id))next.elements[c.target].props[c.property]=values[c.id];
  return checkSpec(next);
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
