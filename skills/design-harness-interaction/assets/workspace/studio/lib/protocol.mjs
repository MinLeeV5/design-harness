import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

export const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
export const hash = data => createHash("sha256").update(data).digest("hex");
export const inside = (base, file) => file === base || file.startsWith(base + path.sep);
export const safeId = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
export function assert(condition, message) { if (!condition) throw new Error(message); }
export function resolveFile(base, relative) {
  assert(typeof relative === "string" && relative && !path.isAbsolute(relative) && !relative.includes("\\") &&
    !relative.split("/").includes(".."), "非法相对路径: " + relative);
  const root = fs.realpathSync(base);
  const file = path.resolve(root, relative);
  assert(inside(root, file) && fs.existsSync(file), "资源不存在: " + relative);
  const real = fs.realpathSync(file);
  assert(inside(root, real) && fs.statSync(real).isFile(), "资源越界或不是文件: " + relative);
  assert(real === file, "不允许软链接资源: " + relative);
  return real;
}
export function filesIn(base) {
  const result = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,"en"))) {
      const file = path.join(dir, item.name);
      assert(!item.isSymbolicLink(), "不允许软链接资源: " + file);
      if (item.isDirectory()) walk(file);
      else if (item.isFile()) result.push(file);
    }
  }
  walk(base); return result;
}
export function requirementRoot(workspace, id) {
  assert(safeId(id), "需求 ID 只支持小写字母、数字和连字符");
  const folder = path.join(workspace, "requirements", id);
  assert(fs.existsSync(folder) && fs.realpathSync(folder) === path.resolve(folder), "需求目录不存在或包含软链接: " + id);
  return folder;
}
function unique(items, label) {
  assert(Array.isArray(items) && items.length > 0, label + "不能为空");
  const ids = new Set();
  for (const item of items) {
    assert(safeId(item.id) && !ids.has(item.id), label + " ID 无效或重复: " + item.id);
    assert(typeof item.title === "string" && item.title.trim(), label + "缺少标题: " + item.id);
    ids.add(item.id);
  }
  return ids;
}
export function validateValues(manifest, values) {
  assert(values && typeof values === "object" && !Array.isArray(values), "候选参数必须是对象");
  const controls = new Map(manifest.controls.map(control=>[control.id,control]));
  for (const [id,value] of Object.entries(values)) {
    const c=controls.get(id);
    assert(c && Number.isFinite(value) && value>=c.min && value<=c.max &&
      Math.abs((value-c.min)/c.step-Math.round((value-c.min)/c.step))<1e-7, "非法候选参数: " + id);
  }
}
export function loadRequirement(workspace, id) {
  const folder=requirementRoot(workspace,id);
  const manifest=readJson(resolveFile(folder,"manifest.json"));
  assert(manifest.schemaVersion===1 && manifest.id===id && typeof manifest.title==="string" && manifest.title.trim(), "需求协议版本或 ID 不匹配");
  const pageIds=unique(manifest.pages,"页面");
  unique(manifest.candidates,"候选"); unique(manifest.viewports,"视口");
  const foundation=readJson(resolveFile(folder,"foundation/foundation.json"));
  assert(foundation.schemaVersion===1 && foundation.version===manifest.foundationVersion,"设计基础版本不匹配");
  assert(Array.isArray(manifest.controls),"缺少 controls 数组");
  const controlIds=new Set(), variables=new Set();
  for(const c of manifest.controls) {
    assert(safeId(c.id) && !controlIds.has(c.id) && typeof c.label==="string" && c.label &&
      typeof c.target==="string" && /^[a-z][a-z0-9-]*$/.test(c.target) &&
      c.type==="range" && /^--[a-z][a-z0-9-]*$/.test(c.cssVar) && !variables.has(c.cssVar) &&
      ["px",""].includes(c.unit) && [c.min,c.max,c.step,c.default].every(Number.isFinite) &&
      c.min<c.max && c.step>0 && c.default>=c.min && c.default<=c.max, "非法调参定义: "+c.id);
    controlIds.add(c.id); variables.add(c.cssVar);
  }
  validateValues(manifest,Object.fromEntries(manifest.controls.map(c=>[c.id,c.default])));
  for(const v of manifest.viewports) assert(Number.isInteger(v.width) && v.width>=320 && v.width<=3840 &&
    Number.isInteger(v.height) && v.height>=320 && v.height<=3840,"非法视口尺寸: "+v.id);
  for(const p of manifest.pages) resolveFile(folder,p.entry);
  const params={},hashes={}; const paramFiles=new Set();
  for(const c of manifest.candidates) {
    assert(c.params.startsWith("candidates/") && c.params.endsWith(".json") && !paramFiles.has(c.params),"候选参数路径必须独立");
    paramFiles.add(c.params);
    const file=resolveFile(folder,c.params);
    params[c.id]=readJson(file); hashes[c.id]=hash(fs.readFileSync(file));
    validateValues(manifest,params[c.id]);
    if(c.entries) for(const [page,entry] of Object.entries(c.entries)) {
      assert(pageIds.has(page),"候选引用未知页面: "+page); resolveFile(folder,entry);
    }
  }
  const documentation=fs.readFileSync(resolveFile(folder,"requirement.md"),"utf8");
  const sections=[...documentation.matchAll(/^#{1,6}\s+.+?\s+\{#([a-z][a-z0-9-]*)\}\s*$/gm)].map(match=>match[1]);
  assert(new Set(sections).size===sections.length,"说明章节 ID 重复");
  const scenarios=readJson(resolveFile(folder,"scenarios.json"));
  unique(scenarios,"场景");
  for(const s of scenarios) {
    assert(pageIds.has(s.page) && s.state && typeof s.state==="object" && !Array.isArray(s.state) && Array.isArray(s.annotations),"非法场景: "+s.id);
    const targets=new Set();
    for(const a of s.annotations) {
      assert(a && typeof a.target==="string" && /^[a-z][a-z0-9-]*$/.test(a.target) &&
        !targets.has(a.target) && sections.includes(a.section),"说明关联失效: "+s.id);
      targets.add(a.target);
    }
  }
  for(const p of manifest.pages) assert(scenarios.some(s=>s.page===p.id),"页面缺少场景: "+p.id);
  const inputs=[...filesIn(folder),...filesIn(path.join(workspace,"studio")), ...["workspace.json","package.json","package-lock.json","tsconfig.json"].map(file=>resolveFile(workspace,file))];
  const revision=hash(Buffer.concat(inputs.flatMap(file=>[Buffer.from(path.relative(folder,file)),fs.readFileSync(file)])));
  return {folder,manifest,scenarios,documentation,params,hashes,revision};
}
export function listRequirements(workspace) {
  return fs.readdirSync(path.join(workspace,"requirements"),{withFileTypes:true})
    .filter(entry=>entry.isDirectory() && safeId(entry.name))
    .map(entry=>{
      try {
        const manifest=readJson(resolveFile(path.join(workspace,"requirements",entry.name),"manifest.json"));
        return {id:entry.name,title:typeof manifest.title==="string" ? manifest.title : entry.name};
      } catch {return {id:entry.name,title:entry.name+"（草稿待修复）"};}
    });
}
