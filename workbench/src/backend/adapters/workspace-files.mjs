import fs from "node:fs";
import path from "node:path";
import {assert,safeId} from "../../contracts/assertions.mjs";
import {designOrganization,creationPurpose,requirementPurpose} from "../../contracts/design-organization.mjs";
import {readJson,filesIn,resolveFile,fileHash} from "./filesystem.mjs";
import {loadProject,loadRequirement} from "./resource-store.mjs";
import {writeSpec} from "./spec-store.mjs";
import {TOOL,PLUGIN} from "../paths.mjs";
export function workspacePath(project) {
  const root=fs.realpathSync(project),entry=path.join(root,"project.json");
  if(fs.existsSync(entry)){try{const config=readJson(entry);if(config.schemaVersion===1&&config.renderer==="json-render/react"&&typeof config.name==="string")return root;}catch{/* 业务工程可有自己的 project.json。 */}}
  if(fs.existsSync(path.join(root,"design-harness","project.json")))return path.join(root,"design-harness");
  return fs.existsSync(path.join(root,"foundation"))&&fs.existsSync(path.join(root,"requirements"))?root:path.join(root,"design-harness");
}
export function initialize(project,{example=false,mode,primary}={}) {
  assert(mode!==undefined||primary===undefined,"指定主稿前需要确认设计组织模式 --mode");
  const parent=fs.realpathSync(project),target=path.join(parent,"design-harness");assert(!fs.existsSync(target),"design-harness 已存在，拒绝覆盖");fs.mkdirSync(target);
  try {
    const source=path.join(PLUGIN,"shared/workspace");assert(fs.existsSync(source),"缺少公共业务模板；请安装完整 Design Harness 工具包");filesIn(source);fs.cpSync(source,target,{recursive:true});
    for(const name of ["requirements","reviews"])fs.mkdirSync(path.join(target,name),{recursive:true});
    if(mode!==undefined)configureOrganization(target,{mode,primary});
    if(example)createRequirement(target,"example","资料整理 · 设计示例",{preview:true});
    return {workspace:target,designOrganization:designOrganization(loadProject(target)),next:"使用初始化 Skill 确认项目设计组织模式、核对事实并建立基础验证预览；运行 design-harness serve --project <项目目录>。"};
  }catch(error){fs.rmSync(target,{recursive:true,force:true});throw error;}
}
export function configureOrganization(workspace,{mode,primary}={}) {
  const file=resolveFile(workspace,"project.json"),expected=fileHash(file),project=loadProject(workspace);
  const current=designOrganization(project),value={mode,...(primary!==undefined?{primary}:mode==="continuous"?{primary:current?.mode==="continuous"?current.primary:"product"}:{})};
  designOrganization({...project,designOrganization:value});
  if(value.mode==="continuous"&&fs.existsSync(path.join(workspace,"requirements",value.primary))) {
    const manifest=readJson(resolveFile(workspace,"requirements/"+value.primary+"/manifest.json"));
    assert(requirementPurpose(manifest)!=="foundation-preview","产品主稿不能指向基础验证预览");
  }
  writeSpec(file,{...project,designOrganization:value},expected);
  return value;
}

export function createRequirement(workspace,id,title=id,options={}) {
  const project=loadProject(workspace);assert(safeId(id),"需求 ID 无效");
  const purpose=creationPurpose(project,id,options),folder=path.join(workspace,"requirements",id);
  assert(!fs.existsSync(folder),"需求已存在，拒绝覆盖: "+id);fs.mkdirSync(path.dirname(folder),{recursive:true});assert(fs.realpathSync(path.dirname(folder))===path.resolve(path.dirname(folder)),"需求目录不允许软链接");fs.mkdirSync(folder);
  try {
    const source=path.join(TOOL,"starter");filesIn(source);filesIn(path.join(workspace,"foundation"));fs.cpSync(source,folder,{recursive:true});
    const manifest=readJson(path.join(folder,"manifest.json"));manifest.id=id;manifest.title=title;delete manifest.foundationVersion;manifest.foundation="shared";
    manifest.purpose=purpose;
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
