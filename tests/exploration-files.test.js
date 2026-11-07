import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {initialize} from "../workbench/src/backend/services/workspace.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {createExplorationFiles} from "../workbench/src/backend/adapters/exploration-files.mjs";

function fixture(check){const root=fs.mkdtempSync(path.join(os.tmpdir(),"dh-exploration-files-")),workspace=initialize(root,{example:true}).workspace;try{return check({root,workspace,source:path.join(workspace,"requirements/example"),files:createExplorationFiles(workspace)});}finally{fs.rmSync(root,{recursive:true,force:true});}}
const group="a".repeat(32);

test("Saved design variants survive restart without changing the accepted design revision",()=>fixture(({root,workspace,source,files})=>{
  const revision=loadRequirement(workspace,"example").revision,key=files.saveSnapshot("example","comfortable",source);
  const first=files.mutate("example","comfortable",0,groups=>groups.push({id:group,snapshot:key,options:[{id:"a",versions:[{snapshot:key}]}]}));assert.equal(first.version,1);
  assert.equal(loadRequirement(workspace,"example").revision,revision);
  const restarted=createExplorationFiles(workspace);assert.deepEqual(restarted.read("example","comfortable"),first);
  const destination=path.join(root,"restored");fs.mkdirSync(destination);fs.writeFileSync(path.join(destination,"extra.json"),"{}");restarted.restore("example","comfortable",key,destination);
  assert.deepEqual(fs.readFileSync(path.join(destination,"manifest.json")),fs.readFileSync(path.join(source,"manifest.json")));assert.equal(fs.existsSync(path.join(destination,"extra.json")),false);assert.equal(fs.existsSync(path.join(destination,"explorations")),false);
  assert.throws(()=>restarted.mutate("example","comfortable",0,()=>{}),/已更新/);
  assert.deepEqual(restarted.read("example","compact").groups,[]);
}));

test("Snapshots share immutable file contents and deletion preserves referenced ancestors",()=>fixture(({root,source,files})=>{
  const original=files.saveSnapshot("example","comfortable",source),variant=path.join(root,"variant");fs.mkdirSync(variant);files.restore("example","comfortable",original,variant);
  fs.appendFileSync(path.join(variant,"handoff.md"),"\n已融合方案甲的导航与方案乙的内容区。\n");const modified=files.saveSnapshot("example","comfortable",variant);assert.notEqual(original,modified);
  const before=files.snapshot("example","comfortable",original),after=files.snapshot("example","comfortable",modified);assert.equal(before.files.filter((file,i)=>file.key!==after.files[i].key).length,1);
  files.mutate("example","comfortable",0,groups=>groups.push({id:group,snapshot:original,originalSnapshot:original,options:[{id:"d",versions:[{snapshot:modified,originalSnapshot:original}]}]}));files.collect("example","comfortable");assert.ok(files.contents("example","comfortable",original).size);assert.match(files.contents("example","comfortable",modified).get("handoff.md").toString(),/已融合/);
  const image=Buffer.from("saved discussion image"),screenshot=files.putObject("example","comfortable",image);files.mutate("example","comfortable",1,groups=>groups.splice(0,1,{id:"b".repeat(32),snapshot:original,originalSnapshot:original,options:[],discussion:[{references:[{snapshot:modified,screenshot}]}]}));files.collect("example","comfortable");assert.ok(files.contents("example","comfortable",modified).size);assert.deepEqual(files.object("example","comfortable",screenshot),image);
  files.mutate("example","comfortable",2,groups=>groups.splice(0));files.collect("example","comfortable");assert.throws(()=>files.contents("example","comfortable",modified),/已删除/);
}));

test("History rejects invalid ownership, corrupted contents and symbolic links",()=>fixture(({root,source,files})=>{
  assert.throws(()=>files.read("../example","comfortable"),/归属/);assert.throws(()=>files.saveSnapshot("example","missing",source),/不属于/);
  const key=files.saveSnapshot("example","comfortable",source),file=files.snapshot("example","comfortable",key).files[0],objects=path.join(source,"explorations/comfortable/objects"),object=path.join(objects,file.key),original=fs.readFileSync(object);
  fs.writeFileSync(object,"corrupted");assert.throws(()=>files.contents("example","comfortable",key),/损坏/);fs.writeFileSync(object,original);
  const outside=path.join(root,"outside");fs.writeFileSync(outside,original);fs.rmSync(object);fs.symlinkSync(outside,object);assert.throws(()=>files.contents("example","comfortable",key),/软链接/);assert.equal(loadRequirement(path.dirname(path.dirname(source)),"example").manifest.id,"example","历史损坏不破坏正式设计读取");
}));
