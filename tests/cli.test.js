import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(import.meta.dirname,".."),cli=path.join(root,"workbench/cli.mjs");
const {name:packageName,version}=JSON.parse(fs.readFileSync(path.join(root,"package.json")));
const run=(cwd,args,env=process.env)=>spawnSync(process.execPath,[cli,...args],{cwd,env,encoding:"utf8",timeout:20000});

test("CLI help, version and professional resources work before workspace initialization",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"dh-cli 中文 "));
  try {
    for(const args of [[],["--help"],["-h"],["help"]]) {
      const result=run(directory,args);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/design-harness <命令>/);
    }
    for(const arg of ["--version","-v"])assert.equal(run(directory,[arg]).stdout.trim(),version);
    const result=run(directory,["skills"]);assert.equal(result.status,0,result.stderr);
    const data=JSON.parse(result.stdout);assert.equal(data.skills.length,5);assert.ok(fs.existsSync(data.shared));
    for(const skill of data.skills)assert.ok(fs.readFileSync(skill.entry,"utf8").includes("name: "+skill.name));
    assert.equal(JSON.parse(run(directory,["skills","visual"]).stdout).skills[0].name,"design-harness-visual");
    for(const selector of ["implement","design-harness-implement"]) {
      const located=run(directory,["skills",selector]);assert.equal(located.status,0,located.stderr);
      assert.deepEqual(JSON.parse(located.stdout).skills,[data.skills.find(skill=>skill.name==="design-harness-implement")]);
    }
    assert.notEqual(run(directory,["skills","unknown"]).status,0);
    const invalid=run(directory,["unsupported"]);assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/未知命令/);
    assert.deepEqual(fs.readdirSync(directory),[]);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test("Global and plugin commands use the project's installed CLI, preserving arguments and exit status",()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-local 中文 "));
  try {
    const dependency=path.join(project,"node_modules",packageName),nested=path.join(project,"design-harness/requirements/example");
    fs.mkdirSync(dependency,{recursive:true});fs.mkdirSync(nested,{recursive:true});
    fs.writeFileSync(path.join(project,"package.json"),JSON.stringify({private:true,devDependencies:{[packageName]:"1.2.3"}}));
    fs.writeFileSync(path.join(dependency,"package.json"),JSON.stringify({name:packageName,version:"1.2.3",bin:{"design-harness":"cli.cjs"}}));
    fs.writeFileSync(path.join(dependency,"cli.cjs"),'console.log(JSON.stringify({local:true,args:process.argv.slice(2)}));process.exitCode=23;');
    const args=["export","example","--project",project,"--out",path.join(project,"预览 文件.html"),"--project-version-option","project-value"];
    const explicit=run(os.tmpdir(),args);assert.equal(explicit.status,23,explicit.stderr);assert.deepEqual(JSON.parse(explicit.stdout),{local:true,args});
    const implicit=run(nested,["--version"]);assert.equal(implicit.status,23,implicit.stderr);assert.equal(JSON.parse(implicit.stdout).local,true);
    fs.unlinkSync(path.join(dependency,"cli.cjs"));assert.notEqual(run(project,["--version"]).status,0);
  } finally { fs.rmSync(project,{recursive:true,force:true}); }
});

test("A linked local CLI recognizes itself without recursive delegation",()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-cli-link-"));
  try {
    const dependency=path.join(project,"node_modules",packageName);
    fs.mkdirSync(path.dirname(dependency),{recursive:true});fs.symlinkSync(root,dependency,"junction");
    const result=run(project,["--version"]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),version);
  } finally { fs.rmSync(project,{recursive:true,force:true}); }
});

test("An unrelated design-harness package does not intercept the CLI",()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-unrelated-package-"));
  try {
    const dependency=path.join(project,"node_modules/design-harness");
    fs.mkdirSync(dependency,{recursive:true});
    fs.writeFileSync(path.join(dependency,"package.json"),JSON.stringify({name:"design-harness",bin:{ds:"cli.cjs"}}));
    fs.writeFileSync(path.join(dependency,"cli.cjs"),'throw new Error("Unrelated package must not run");');
    const result=run(project,["--version"]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),version);
  } finally { fs.rmSync(project,{recursive:true,force:true}); }
});

test("An optional plugin can delegate before installing its own runtime dependencies",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-cold-plugin-"));
  try {
    const plugin=path.join(base,"plugin"),project=path.join(base,"project"),dependency=path.join(project,"node_modules",packageName);
    fs.mkdirSync(plugin);fs.cpSync(path.join(root,"workbench"),path.join(plugin,"workbench"),{recursive:true});
    fs.copyFileSync(path.join(root,"package.json"),path.join(plugin,"package.json"));fs.mkdirSync(dependency,{recursive:true});
    fs.writeFileSync(path.join(dependency,"package.json"),JSON.stringify({name:packageName,bin:{"design-harness":"cli.cjs"}}));
    fs.writeFileSync(path.join(dependency,"cli.cjs"),'console.log("project-local-cli");');
    const result=spawnSync(process.execPath,[path.join(plugin,"workbench/cli.mjs"),"--project",project,"--version"],{cwd:base,encoding:"utf8",timeout:10000});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),"project-local-cli");
  } finally { fs.rmSync(base,{recursive:true,force:true}); }
});

test("Missing Codex is reported independently of CLI and workspace availability",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"dh-cli-no-codex-"));
  try {
    const result=run(directory,["doctor"],{...process.env,PATH:""});assert.equal(result.status,0,result.stderr);
    const status=JSON.parse(result.stdout);assert.equal(status.version,version);assert.equal(status.codex.available,false);assert.match(status.codex.error,/未找到本机 Codex/);
    assert.deepEqual(fs.readdirSync(directory),[]);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
