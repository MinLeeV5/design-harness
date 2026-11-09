import fs from "node:fs";
import path from "node:path";
import {assert} from "../../contracts/assertions.mjs";
import {designOrganization} from "../../contracts/design-organization.mjs";
import {PLUGIN} from "../paths.mjs";
import {inside} from "./filesystem.mjs";
import {loadProject} from "./resource-store.mjs";
import {initialize,workspacePath} from "./workspace-files.mjs";

const packageName=JSON.parse(fs.readFileSync(path.join(PLUGIN,"package.json"),"utf8")).name;
const phases=["product","init","interaction","visual","implement"];

function entryInfo(file) {
  try { return fs.lstatSync(file); }
  catch(error) { if(error.code==="ENOENT")return null;throw error; }
}

// Preserve the public node_modules path so pnpm upgrades do not pin links to its versioned store.
function installedPackage(project) {
  for(let directory=project;;directory=path.dirname(directory)) {
    const local=path.join(directory,"node_modules",packageName);
    if(fs.existsSync(local)&&fs.realpathSync(local)===fs.realpathSync(PLUGIN))return local;
    if(path.dirname(directory)===directory)return PLUGIN;
  }
}

function skillDirectory(project) {
  let directory=project;
  for(const name of [".agents","skills"]) {
    directory=path.join(directory,name);
    if(!entryInfo(directory))continue;
    assert(fs.existsSync(directory)&&fs.statSync(directory).isDirectory(),"Skill 入口目录不可用: "+directory);
    directory=fs.realpathSync(directory);
    assert(inside(project,directory),"Skill 入口目录必须位于项目内: "+directory);
  }
  return directory;
}

function planLinks(project) {
  const directory=skillDirectory(project),tool=installedPackage(project);
  const skills=phases.map(phase=>{
    const name="design-harness-"+phase,source=path.join(tool,"skills",name),file=path.join(directory,name);
    assert(fs.existsSync(path.join(source,"SKILL.md")),"缺少专业 Skill；请安装完整 Design Harness 工具包: "+name);
    const current=entryInfo(file);
    assert(!current||current.isSymbolicLink()&&fs.existsSync(file)&&fs.realpathSync(file)===fs.realpathSync(source),
      "Skill 同名冲突，拒绝覆盖: "+file);
    return {name,path:file,target:source,existing:!!current};
  });
  return {directory,skills};
}

export function initializeProject(project,options={}) {
  let parent=fs.realpathSync(project);
  if(path.basename(parent)==="design-harness"&&workspacePath(parent)===parent)parent=path.dirname(parent);
  const workspace=path.join(parent,"design-harness"),existing=entryInfo(workspace);
  let organization;
  if(existing) {
    assert(existing.isDirectory()&&!existing.isSymbolicLink(),"设计目录不可用，拒绝覆盖: "+workspace);
    organization=designOrganization(loadProject(workspace));
    assert(options.primary===undefined||options.mode!==undefined,"指定主稿前需要确认设计组织模式 --mode");
    assert((options.mode===undefined||options.mode===organization?.mode)&&
      (options.primary===undefined||options.primary===organization?.primary),"已有设计配置保持不变；请使用 organization 调整组织模式");
    assert(!options.example||fs.existsSync(path.join(workspace,"requirements/example/manifest.json")),
      "已有设计不补写示例；请使用 new 创建需求");
  }
  // Check every destination before creating either design resources or links.
  const {directory,skills}=planLinks(parent),created=[];
  let createdDirectory,createdWorkspace=false;
  try {
    if(!existing) {
      const initialized=initialize(parent,options);
      organization=initialized.designOrganization;createdWorkspace=true;
    }
    createdDirectory=fs.mkdirSync(directory,{recursive:true});
    for(const skill of skills)if(!skill.existing) {
      fs.symlinkSync(process.platform==="win32"?skill.target:path.relative(directory,skill.target),skill.path,process.platform==="win32"?"junction":"dir");
      created.push(skill.path);
    }
    return {workspace,created:createdWorkspace,designOrganization:organization,
      skills:skills.map(({existing,...skill})=>skill),
      next:"使用 $design-harness-init 核对事实、确认设计组织模式并建立基础验证预览；若当前 Agent 未发现入口，请重新打开会话。"};
  }catch(error) {
    for(const file of created.reverse())fs.unlinkSync(file);
    if(createdDirectory)for(let folder=directory;inside(createdDirectory,folder);folder=path.dirname(folder)) {
      try { fs.rmdirSync(folder); }
      catch { break; }
      if(folder===createdDirectory)break;
    }
    if(createdWorkspace)fs.rmSync(workspace,{recursive:true,force:true});
    throw error;
  }
}
