import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
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
export function snapshotProposalFiles(directory){
  const result=new Map();let total=0;
  function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name),relative=path.relative(directory,file).split(path.sep).join("/");
    assert(!entry.isSymbolicLink(),"提案副本不能包含软链接："+relative);
    if(relative===".agent-scratch"){assert(entry.isDirectory(),"临时输出目录无效");continue;}
    if(entry.isDirectory())walk(file);else{
      assert(entry.isFile(),"提案副本只能包含普通文件："+relative);assert(result.size<10000,"提案副本文件过多");const size=fs.statSync(file).size;total+=size;assert(size<=64000000&&total<=128000000,"提案副本资源过大");
      const digest=createHash("sha256"),buffer=Buffer.allocUnsafe(65536),descriptor=fs.openSync(file,"r");
      try{let read,bytes=0;while((read=fs.readSync(descriptor,buffer,0,buffer.length,null))>0){bytes+=read;assert(bytes<=64000000,"提案副本资源过大");digest.update(buffer.subarray(0,read));}}finally{fs.closeSync(descriptor);}result.set(relative,digest.digest("hex"));
    }
  }}walk(directory);return result;
}
export function freezeProposalFiles(job){
  const before=snapshotProposalFiles(job.directory),frozen=createProposalDirectory(),original=job.temp;
  const signature=files=>JSON.stringify([...files].sort(([a],[b])=>a.localeCompare(b,"en")));
  try{
    for(const relative of before.keys()){const source=safeDestination(job.directory,relative),target=safeDestination(frozen.directory,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
    assert(signature(snapshotProposalFiles(job.directory))===signature(before)&&signature(snapshotProposalFiles(frozen.directory))===signature(before),"提案副本在冻结期间发生变化，请重新生成");
    job.temp=frozen.temp;job.directory=frozen.directory;removeProposalDirectory(original);
  }catch(error){removeProposalDirectory(frozen.temp);throw error;}
}
export function checkProposalFiles(job,{readOnly=false}={}){
  const after=snapshotProposalFiles(job.directory),prefix="requirements/"+job.requirement+"/";let count=0,total=0;
  for(const relative of new Set([...job.stagedFiles.keys(),...after.keys()])){
    if(job.stagedFiles.get(relative)===after.get(relative))continue;
    assert(!readOnly,"只读分析模式不能直接修改提案文件，请通过最终提案返回修改");
    assert(after.has(relative),"提案暂不支持删除文件："+relative);
    const local=relative.startsWith(prefix)?relative.slice(prefix.length):"";
    assert(local&&designText.test(local)&&allowAgentFile(local,job),"工具修改越过当前身份的设计范围："+relative);
    total+=fs.statSync(safeDestination(job.directory,relative)).size;count++;
    assert(count<=60&&total<=2000000,"Agent 修改过大");
  }
}
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
