import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {assert,safeId} from "../../contracts/assertions.mjs";
import {SourceConflict} from "../../contracts/errors.mjs";
import {hash,resourceFiles} from "./filesystem.mjs";

const digest=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const sourcePath=value=>typeof value==="string"&&value.length<=1000&&!path.isAbsolute(value)&&!value.includes("\\")&&!value.split("/").some(part=>!part||part.startsWith(".")||["node_modules","explorations","foundation","reviews"].includes(part));
const empty=(id,candidate)=>({schemaVersion:1,requirement:id,candidate,version:0,groups:[]});

// Canonical design variants live with their requirement. File contents are shared
// by hash; neither the runtime, compiled previews nor foundation are copied here.
export function createExplorationFiles(workspace){
  const root=fs.realpathSync(workspace);
  function folder(id,candidate,parts=[],create=false){
    assert(safeId(id)&&safeId(candidate),"方案归属无效");
    const parents=["requirements",id],tail=["explorations",candidate,...parts];let current=root;
    for(const [index,part] of [...parents,...tail].entries()){
      assert(/^[a-z0-9][a-z0-9-]*$/.test(part),"方案存储路径无效");current=path.join(current,part);
      if(!fs.existsSync(current)){if(index<parents.length)assert(false,"方案所属需求不存在");if(!create)return null;fs.mkdirSync(current,{mode:0o700});}
      const stat=fs.lstatSync(current);assert(!stat.isSymbolicLink()&&stat.isDirectory(),"方案目录无效或包含软链接");
    }
    const manifest=path.join(root,"requirements",id,"manifest.json");
    const value=JSON.parse(regular(manifest,4000000).toString("utf8"));
    assert(value.id===id&&value.candidates?.some(item=>item.id===candidate),"方案不属于当前需求或候选");
    return current;
  }
  function regular(file,limit){
    const stat=fs.lstatSync(file);assert(!stat.isSymbolicLink()&&stat.isFile()&&stat.size<=limit,"方案文件无效、过大或包含软链接");return fs.readFileSync(file);
  }
  function atomic(file,bytes){
    if(fs.existsSync(file))regular(file,64000000);
    const temporary=file+"."+randomBytes(8).toString("hex")+".tmp";
    try{fs.writeFileSync(temporary,bytes,{flag:"wx",mode:0o600});fs.renameSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
  }
  function read(id,candidate){
    const base=folder(id,candidate),file=base&&path.join(base,"state.json");if(!file||!fs.existsSync(file))return empty(id,candidate);
    const value=JSON.parse(regular(file,16000000).toString("utf8"));
    assert(value.schemaVersion===1&&value.requirement===id&&value.candidate===candidate&&Number.isInteger(value.version)&&value.version>=0&&Array.isArray(value.groups)&&value.groups.length<=10000,"方案历史记录损坏，请保留原文件并检查");
    assert(value.groups.every(group=>group&&/^[a-f0-9]{32}$/.test(group.id)&&Array.isArray(group.options))&&new Set(value.groups.map(group=>group.id)).size===value.groups.length,"方案轮次记录无效");return value;
  }
  function mutate(id,candidate,expected,change){
    const current=read(id,candidate);if(expected!==undefined&&current.version!==expected)throw new SourceConflict("方案历史已更新，请刷新后再操作");
    const next=structuredClone(current);change(next.groups);next.version++;
    assert(next.groups.length<=10000&&new Set(next.groups.map(group=>group.id)).size===next.groups.length,"方案轮次过多或重复");
    const bytes=Buffer.from(JSON.stringify(next)+"\n");assert(bytes.length<=16000000,"方案历史记录过大");atomic(path.join(folder(id,candidate,[],true),"state.json"),bytes);return next;
  }
  function saveSnapshot(id,candidate,source){
    const objects=folder(id,candidate,["objects"],true),snapshots=folder(id,candidate,["snapshots"],true),files=[];let total=0;
    for(const file of resourceFiles(source)){
      const relative=path.relative(source,file).split(path.sep).join("/");assert(sourcePath(relative),"不能保存非法方案资源："+relative);
      assert(files.length<10000,"方案资源文件过多");const size=fs.statSync(file).size;total+=size;assert(size<=64000000&&total<=128000000,"方案资源过大");
      const content=regular(file,64000000),key=hash(content),target=path.join(objects,key);
      if(fs.existsSync(target))assert(hash(regular(target,64000000))===key,"方案内容损坏，请保留原文件并检查");else atomic(target,content);
      files.push({path:relative,key,size});
    }
    const bytes=Buffer.from(JSON.stringify({schemaVersion:1,files})),key=hash(bytes),target=path.join(snapshots,key+".json");
    if(fs.existsSync(target))assert(hash(regular(target,4000000))===key,"方案快照损坏");else atomic(target,bytes);return key;
  }
  function snapshot(id,candidate,key){
    assert(digest(key),"方案版本无效");const base=folder(id,candidate,["snapshots"]),file=base&&path.join(base,key+".json");assert(file&&fs.existsSync(file),"方案版本已删除或不可用");
    const bytes=regular(file,4000000);assert(hash(bytes)===key,"方案快照内容损坏");const value=JSON.parse(bytes.toString("utf8"));
    assert(value.schemaVersion===1&&Array.isArray(value.files)&&value.files.length<=10000,"方案快照无效");let total=0;
    assert(value.files.every(file=>sourcePath(file.path)&&digest(file.key)&&Number.isInteger(file.size)&&file.size>=0&&file.size<=64000000&&(total+=file.size)<=128000000)&&new Set(value.files.map(file=>file.path)).size===value.files.length,"方案快照资源无效");return value;
  }
  function putObject(id,candidate,bytes){assert(Buffer.isBuffer(bytes)&&bytes.length<=64000000,"方案附件无效或过大");const key=hash(bytes),file=path.join(folder(id,candidate,["objects"],true),key);if(!fs.existsSync(file))atomic(file,bytes);else assert(hash(regular(file,64000000))===key,"方案附件损坏");return key;}
  function object(id,candidate,key){assert(digest(key),"方案附件标识无效");const base=folder(id,candidate,["objects"]);assert(base,"方案附件不存在");const bytes=regular(path.join(base,key),64000000);assert(hash(bytes)===key,"方案附件损坏");return bytes;}
  function contents(id,candidate,key){
    const value=snapshot(id,candidate,key),objects=folder(id,candidate,["objects"]);assert(objects,"方案资源不存在");
    return new Map(value.files.map(file=>{const bytes=regular(path.join(objects,file.key),64000000);assert(bytes.length===file.size&&hash(bytes)===file.key,"方案资源损坏："+file.path);return [file.path,bytes];}));
  }
  function restore(id,candidate,key,destination){
    const files=contents(id,candidate,key),base=fs.realpathSync(destination);
    for(const file of resourceFiles(base))if(!files.has(path.relative(base,file).split(path.sep).join("/")))fs.rmSync(file);
    for(const [relative,bytes] of files){
      let current=base;const parts=relative.split("/");
      for(const part of parts.slice(0,-1)){current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current);assert(!fs.lstatSync(current).isSymbolicLink()&&fs.statSync(current).isDirectory(),"恢复方案目录包含软链接");}
      const target=path.join(current,parts.at(-1));if(fs.existsSync(target))assert(!fs.lstatSync(target).isSymbolicLink()&&fs.statSync(target).isFile(),"恢复方案文件包含软链接");fs.writeFileSync(target,bytes);
    }
  }
  function collect(id,candidate){
    const state=read(id,candidate),versions=state.groups.flatMap(group=>group.options.flatMap(option=>option.versions??[])),references=[...versions.flatMap(version=>version.references??[]),...state.groups.flatMap(group=>(group.discussion??[]).flatMap(message=>message.references??[]))],keys=new Set([...state.groups.flatMap(group=>[group.snapshot,group.originalSnapshot]),...versions.flatMap(version=>[version.snapshot,version.originalSnapshot]),...references.map(reference=>reference.snapshot)].filter(Boolean)),used=new Set(references.map(reference=>reference.screenshot).filter(Boolean));
    for(const key of keys)for(const file of snapshot(id,candidate,key).files)used.add(file.key);
    for(const [kind,keep,suffix] of [["snapshots",keys,".json"],["objects",used,""]]){const base=folder(id,candidate,[kind]);if(base)for(const entry of fs.readdirSync(base,{withFileTypes:true})){assert(!entry.isSymbolicLink()&&entry.isFile(),"方案存储包含非法文件");const key=suffix?entry.name.slice(0,-suffix.length):entry.name;if(digest(key)&&!keep.has(key))fs.rmSync(path.join(base,entry.name));}}
  }
  function reference(id,candidate,key,temp,index){const directory=path.join(temp,"option-reference-"+index);fs.mkdirSync(directory);restore(id,candidate,key,directory);return {directory,manifest:JSON.parse(regular(path.join(directory,"manifest.json"),4000000).toString("utf8"))};}
  function restoreImage(id,candidate,key,directory){const file=path.join(directory,"reference.png");fs.writeFileSync(file,object(id,candidate,key));return file;}
  function saveImage(id,candidate,file){return putObject(id,candidate,regular(file,64000000));}
  return {read,mutate,saveSnapshot,snapshot,contents,restore,collect,putObject,object,reference,restoreImage,saveImage};
}
