import fs from "node:fs";
import path from "node:path";

import {assert,safeId,readJson,filesIn,loadRequirement,resolveFile,hash,requirementRoot} from "./protocol.mjs";
export function createRequirement(workspace,id,title=id) {
  assert(safeId(id),"需求 ID 无效");
  const folder=path.join(workspace,"requirements",id);
  assert(!fs.existsSync(folder),"需求已存在，拒绝覆盖: "+id);
  fs.mkdirSync(path.dirname(folder),{recursive:true});
  assert(fs.realpathSync(path.dirname(folder))===path.resolve(path.dirname(folder)),"需求目录不允许软链接");
  fs.mkdirSync(folder);
  try {
    const source=path.join(workspace,"studio","starter");
    filesIn(source); filesIn(path.join(workspace,"foundation"));
    fs.cpSync(source,folder,{recursive:true});
    fs.mkdirSync(path.join(folder,"src","components"),{recursive:true});
    fs.mkdirSync(path.join(folder,"assets"),{recursive:true});
    fs.cpSync(path.join(workspace,"foundation"),path.join(folder,"foundation"),{recursive:true});
    const manifest=readJson(path.join(folder,"manifest.json"));
    manifest.id=id;manifest.title=title;
    manifest.foundationVersion=readJson(path.join(folder,"foundation","foundation.json")).version;
    fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    loadRequirement(workspace,id);
  } catch(error) {fs.rmSync(folder,{force:true,recursive:true});throw error;}
  return folder;
}
export function upgradeRequirement(workspace,id,nextId) {
  const original=loadRequirement(workspace,id);
  assert(safeId(nextId),"新需求 ID 无效");
  const next=path.join(workspace,"requirements",nextId);
  assert(!fs.existsSync(next),"需求已存在，拒绝覆盖: "+nextId);
  filesIn(path.join(workspace,"foundation"));
  assert(fs.realpathSync(path.dirname(next))===path.resolve(path.dirname(next)),"需求目录不允许软链接");
  fs.mkdirSync(next);
  try {
    fs.cpSync(original.folder,next,{recursive:true});
    fs.rmSync(path.join(next,"foundation"),{recursive:true});
    fs.cpSync(path.join(workspace,"foundation"),path.join(next,"foundation"),{recursive:true});
    const manifest={...original.manifest,id:nextId,foundationVersion:readJson(path.join(next,"foundation","foundation.json")).version};
    fs.writeFileSync(path.join(next,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    fs.writeFileSync(path.join(next,"handoff.md"),"# 升级草稿\n\n基于 "+id+" 显式升级设计基础；原需求及交付未改变。\n状态：待评审，尚未验收。\n");
    loadRequirement(workspace,nextId);
  } catch(error){fs.rmSync(next,{force:true,recursive:true});throw error;}
  return next;
}
export async function exportRelease(workspace,id,version) {
  assert(typeof version==="string" && /^v[1-9]\d*(?:\.\d+){0,2}$/.test(version),"交付版本示例: v1、v1.1");
  assert(safeId(id),"需求 ID 无效");
  const releaseRoot=path.join(workspace,"releases");
  fs.mkdirSync(releaseRoot,{recursive:true});
  assert(fs.realpathSync(releaseRoot)===path.resolve(releaseRoot),"交付目录不允许软链接");
  const parent=path.join(releaseRoot,id);
  fs.mkdirSync(parent,{recursive:true});
  assert(fs.realpathSync(parent)===path.resolve(parent),"交付目录不允许软链接");
  const directory=path.join(parent,version);
  assert(!fs.existsSync(directory),"交付版本已存在，拒绝覆盖");
  const {buildRequirement}=await import("./build.mjs");
  const {html,data}=await buildRequirement(workspace,id);
  // Bundle and snapshot must describe the same source state.
  assert(loadRequirement(workspace,id).revision===data.revision,"构建时源文件已变化，请重新导出");
  const sources=new Map();
  for(const name of ["workspace.json","package.json","package-lock.json","tsconfig.json"]) sources.set(name,fs.readFileSync(resolveFile(workspace,name)));
  for(const base of [path.join(workspace,"studio"),data.folder]) for(const file of filesIn(base))
    sources.set(path.relative(workspace,file).split(path.sep).join("/"),fs.readFileSync(file));
  assert(loadRequirement(workspace,id).revision===data.revision,"收集快照时源文件已变化，请重新导出");
  fs.mkdirSync(directory);
  try {
    fs.writeFileSync(path.join(directory,"index.html"),html,{flag:"wx"});
    const hashes={"index.html":hash(html)};
    for(const [relative,bytes] of sources) {
      const target=path.join(directory,"sources",relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:"wx"});
      hashes["sources/"+relative]=hash(bytes);
    }
    const release={schemaVersion:1,requirement:id,version,templateVersion:readJson(path.join(workspace,"workspace.json")).templateVersion,
      foundationVersion:data.manifest.foundationVersion,createdAt:new Date().toISOString(),acceptance:"not-recorded",files:hashes};
    fs.writeFileSync(path.join(directory,"release.json"),JSON.stringify(release,null,2)+"\n",{flag:"wx"});
    return {directory,html:path.join(directory,"index.html"),files:Object.keys(hashes).length};
  } catch(error){fs.rmSync(directory,{force:true,recursive:true});throw error;}
}
export function verifyRelease(directory) {
  const manifest=readJson(resolveFile(directory,"release.json"));
  assert(manifest.schemaVersion===1 && manifest.files && Object.keys(manifest.files).length>1,"非法交付清单");
  for(const [relative,digest] of Object.entries(manifest.files))
    assert(hash(fs.readFileSync(resolveFile(directory,relative)))===digest,"交付字节已改变: "+relative);
  const actual=filesIn(directory).map(file=>path.relative(directory,file).split(path.sep).join("/")).filter(file=>file!=="release.json");
  assert(actual.length===Object.keys(manifest.files).length,"交付包含未登记文件");
  return {requirement:manifest.requirement,version:manifest.version,files:actual.length};
}
export async function checkWorkspace(workspace,id) {return (await import("./build.mjs")).checkWorkspace(workspace,id);}
