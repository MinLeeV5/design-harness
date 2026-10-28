import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {assert} from "../../contracts/assertions.mjs";
import {tuneProposal} from "../../contracts/agent-controls.mjs";
import {allowAgentFile,designText} from "../../contracts/agent-policy.mjs";
import {inside,resourceFiles,hash,filesIn} from "./filesystem.mjs";
import {loadRequirement} from "./resource-store.mjs";
export function safeDestination(root,relative) {
  assert(typeof relative==="string"&&relative&&!path.isAbsolute(relative)&&!relative.includes("\\")&&!relative.split("/").some(s=>!s||s.startsWith(".")||["node_modules"].includes(s)),"Agent 返回了非法资源路径");
  const file=path.resolve(root,relative);assert(inside(root,file),"Agent 资源越界");
  let cursor=root;for(const part of relative.split("/")){cursor=path.join(cursor,part);if(fs.existsSync(cursor))assert(!fs.lstatSync(cursor).isSymbolicLink(),"Agent 资源路径包含软链接");}
  return file;
}
export function copyResources(workspace,data,destination) {
  for(const name of ["project.json","package.json","dependencies.lock.json"])if(fs.existsSync(path.join(workspace,name)))fs.copyFileSync(path.join(workspace,name),path.join(destination,name));
  fs.cpSync(data.foundationRoot,path.join(destination,"foundation"),{recursive:true});
  for(const file of resourceFiles(data.folder)){const target=path.join(destination,"requirements",data.manifest.id,path.relative(data.folder,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
}
export function changesFor(job){const folder=path.join(job.directory,"requirements",job.requirement),changes=[];for(const file of resourceFiles(folder).filter(file=>designText.test(file))){const relative=path.relative(folder,file).split(path.sep).join("/"),before=job.originalFiles.get(relative)??null,after=fs.readFileSync(file,"utf8");if(before!==after)changes.push({path:relative,before,after});}return changes;}
export async function stageValues(job,values){
    if(!values||Object.keys(values).length===0)return false;
    const tuned=tuneProposal(job.proposal,values),data=loadRequirement(job.directory,job.requirement),specFile=data.specFiles[job.candidate+":"+job.page],candidate=data.manifest.candidates.find(c=>c.id===job.candidate),paramsFile=safeDestination(data.folder,candidate.params),beforeSpec=fs.readFileSync(specFile),beforeParams=fs.readFileSync(paramsFile);
    if(JSON.stringify(tuned.spec)===JSON.stringify(data.specs[job.candidate+":"+job.page])&&JSON.stringify(tuned.css)===JSON.stringify(data.params[job.candidate].css))return false;
    try{fs.writeFileSync(specFile,JSON.stringify(tuned.spec,null,2)+"\n");fs.writeFileSync(paramsFile,JSON.stringify({...data.params[job.candidate],css:tuned.css},null,2)+"\n");loadRequirement(job.directory,job.requirement);}
    catch(error){fs.writeFileSync(specFile,beforeSpec);fs.writeFileSync(paramsFile,beforeParams);throw error;}
    return true;
  }

export function createProposalDirectory() {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"design-harness-live-"));
  fs.mkdirSync(path.join(temp,"resources"));
  return {temp,directory:fs.realpathSync(path.join(temp,"resources"))};
}
export const removeProposalDirectory = directory => fs.rmSync(directory,{recursive:true,force:true});
export const snapshotFiles = folder => new Map(resourceFiles(folder).filter(file=>designText.test(file)).map(file=>[path.relative(folder,file).split(path.sep).join("/"),fs.readFileSync(file,"utf8")]));
export const authoredSources = root => filesIn(root).filter(file=>/\.(css|tsx?|jsx?)$/.test(file)).map(file=>fs.readFileSync(file,"utf8")).join("\n");

export function stageModelFiles(job,result) {
  const directory=job.directory;
        const seen=new Set();let total=0;
        for(const item of result.files){assert(item&&typeof item.content==="string"&&designText.test(item.path),"Agent 只能修改文本设计资源");assert(allowAgentFile(item.path,job)&&!seen.has(item.path),"Agent 修改越过当前身份的设计范围或路径重复");seen.add(item.path);total+=Buffer.byteLength(item.content);assert(total<=2000000,"Agent 修改过大");const target=safeDestination(path.join(directory,"requirements",job.requirement),item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,item.content);}
}
export function snapshotTuningFiles(job) {
  const staged=loadRequirement(job.directory,job.requirement);
  const definition=staged.manifest.candidates.find(c=>c.id===job.candidate);
  return new Map([staged.specFiles[job.candidate+":"+job.page],safeDestination(staged.folder,definition.params)].map(file=>[file,fs.readFileSync(file)]));
}
export function restoreTuningFiles(snapshot) {
  for(const [file,bytes] of snapshot)fs.writeFileSync(file,bytes);
}
export function commitProposalFiles(data,job) {
const written=[];
    try {
      for(const change of job.changes){const file=safeDestination(data.folder,change.path);assert((fs.existsSync(file)?fs.readFileSync(file,"utf8"):null)===change.before,"源文件已变化："+change.path);}
      for(const change of job.changes){const file=safeDestination(data.folder,change.path);fs.mkdirSync(path.dirname(file),{recursive:true});const pending=file+"."+job.id+".tmp";try{fs.writeFileSync(pending,change.after,{flag:"wx"});fs.renameSync(pending,file);written.push({file,...change});}finally{fs.rmSync(pending,{force:true});}}
    }catch(error){for(const item of written.reverse())if(fs.existsSync(item.file)&&hash(fs.readFileSync(item.file))===hash(item.after)){if(item.before===null)fs.rmSync(item.file);else fs.writeFileSync(item.file,item.before);}throw error;}
}
