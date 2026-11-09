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
    assert.equal(JSON.parse(run(directory,["skills","init"]).stdout).skills[0].name,"design-harness-init");
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

test("CLI init links five usable Skills and preserves designs on repeated runs",()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init 中文 "));
  try {
    const result=run(project,["init","--example","--mode","continuous","--primary","product"],{...process.env,PATH:""});
    assert.equal(result.status,0,result.stderr);
    const initialized=JSON.parse(result.stdout),directory=path.join(project,".agents/skills");
    assert.equal(initialized.created,true);assert.equal(initialized.skills.length,5);
    assert.equal(initialized.workspace,fs.realpathSync(path.join(project,"design-harness")));
    for(const skill of initialized.skills) {
      const link=path.join(directory,skill.name);
      assert.ok(fs.lstatSync(link).isSymbolicLink());assert.equal(fs.realpathSync(link),fs.realpathSync(path.join(root,"skills",skill.name)));
      const entry=fs.realpathSync(path.join(link,"SKILL.md"));
      assert.ok(fs.readFileSync(entry,"utf8").includes("name: "+skill.name));
      for(const match of fs.readFileSync(entry,"utf8").matchAll(/\]\(([^)]+)\)/g)) {
        if(!/^(?:https?:|#)/.test(match[1]))assert.ok(fs.existsSync(path.resolve(path.dirname(entry),match[1].split("#")[0])),match[1]);
      }
    }
    const file=path.join(initialized.workspace,"foundation/tokens.css");fs.appendFileSync(file,"\n/* user design */\n");
    const before=fs.readFileSync(file),config=fs.readFileSync(path.join(initialized.workspace,"project.json"));
    const repeated=run(project,["init"]);assert.equal(repeated.status,0,repeated.stderr);assert.equal(JSON.parse(repeated.stdout).created,false);
    assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(path.join(initialized.workspace,"project.json")),config);
    const conflict=run(project,["init","--mode","per-requirement"]);assert.notEqual(conflict.status,0);assert.match(conflict.stderr,/organization/);
    assert.deepEqual(fs.readFileSync(path.join(initialized.workspace,"project.json")),config);
    const fromResources=run(project,["init","--project",initialized.workspace]);assert.equal(fromResources.status,0,fromResources.stderr);
    assert.equal(fs.existsSync(path.join(initialized.workspace,"design-harness")),false);
  } finally { fs.rmSync(project,{recursive:true,force:true}); }
});

test("CLI init adds missing links to a legacy workspace without recreating its resources",async()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init-existing-"));
  try {
    const {initialize}=await import("../workbench/src/backend/services/workspace.mjs"),{workspace}=initialize(project);
    const file=path.join(workspace,"foundation/design.md");fs.writeFileSync(file,"Existing project design\n");
    const initialized=run(project,["init"]);assert.equal(initialized.status,0,initialized.stderr);assert.equal(JSON.parse(initialized.stdout).created,false);
    const link=path.join(project,".agents/skills/design-harness-visual");fs.unlinkSync(link);
    const repaired=run(project,["init"]);assert.equal(repaired.status,0,repaired.stderr);assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.equal(fs.readFileSync(file,"utf8"),"Existing project design\n");
  } finally { fs.rmSync(project,{recursive:true,force:true}); }
});

test("CLI init rejects same-name Skill conflicts before creating resources or partial links",()=>{
  for(const kind of ["directory","file","symlink","broken-link"]) {
    const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init-conflict-"));
    try {
      const directory=path.join(project,".agents/skills"),conflict=path.join(directory,"design-harness-visual");fs.mkdirSync(directory,{recursive:true});
      if(kind==="directory")fs.mkdirSync(conflict);
      else if(kind==="file")fs.writeFileSync(conflict,"user skill");
      else {const target=path.join(project,"other-skill");if(kind==="symlink")fs.mkdirSync(target);fs.symlinkSync(target,conflict,"junction");}
      const result=run(project,["init"]);assert.notEqual(result.status,0,kind);assert.match(result.stderr,/同名冲突/);
      assert.deepEqual(fs.readdirSync(directory),["design-harness-visual"]);assert.equal(fs.existsSync(path.join(project,"design-harness")),false);
      assert.ok(fs.lstatSync(conflict));if(kind==="file")assert.equal(fs.readFileSync(conflict,"utf8"),"user skill");
    } finally { fs.rmSync(project,{recursive:true,force:true}); }
  }
});

test("CLI init preserves an existing skills-directory link inside the project",()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init-shared-skills-"));
  try {
    const shared=path.join(project,".harness/skills"),agents=path.join(project,".agents");
    fs.mkdirSync(shared,{recursive:true});fs.mkdirSync(agents);fs.symlinkSync(shared,path.join(agents,"skills"),"junction");
    fs.writeFileSync(path.join(shared,"other.md"),"Other Skill");
    const result=run(project,["init"]);assert.equal(result.status,0,result.stderr);
    assert.ok(fs.lstatSync(path.join(agents,"skills")).isSymbolicLink());assert.equal(fs.readFileSync(path.join(shared,"other.md"),"utf8"),"Other Skill");
    for(const skill of JSON.parse(result.stdout).skills)assert.equal(fs.realpathSync(skill.path),fs.realpathSync(path.join(root,"skills",skill.name)));
  } finally { fs.rmSync(project,{recursive:true,force:true}); }
});

test("CLI init refuses linked entry directories outside the project",()=>{
  for(const level of [".agents",".agents/skills"]) {
    const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init-outside-")),project=path.join(base,"project"),outside=path.join(base,"outside");
    try {
      fs.mkdirSync(project);fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,"keep.md"),"keep");
      const link=path.join(project,level);fs.mkdirSync(path.dirname(link),{recursive:true});fs.symlinkSync(outside,link,"junction");
      const result=run(project,["init"]);assert.notEqual(result.status,0);assert.match(result.stderr,/必须位于项目内/);
      assert.deepEqual(fs.readdirSync(outside),["keep.md"]);assert.equal(fs.existsSync(path.join(project,"design-harness")),false);
    } finally { fs.rmSync(base,{recursive:true,force:true}); }
  }
});

test("Project dependency Skill links remain relative and work after moving the project",()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init-portable-")),project=path.join(base,"before"),moved=path.join(base,"after 中文");
  try {
    const dependency=path.join(project,"node_modules",packageName);fs.mkdirSync(path.dirname(dependency),{recursive:true});fs.symlinkSync(root,dependency,"junction");
    const result=run(project,["init"]);assert.equal(result.status,0,result.stderr);
    const link=path.join(project,".agents/skills/design-harness-init"),target=fs.readlinkSync(link);
    if(process.platform!=="win32"){assert.equal(path.isAbsolute(target),false);assert.equal(target,path.join("../..","node_modules",packageName,"skills/design-harness-init"));}
    fs.renameSync(project,moved);
    const repeated=run(moved,["init"]);assert.equal(repeated.status,0,repeated.stderr);
    assert.equal(fs.realpathSync(path.join(moved,".agents/skills/design-harness-init/SKILL.md")),fs.realpathSync(path.join(root,"skills/design-harness-init/SKILL.md")));
  } finally { fs.rmSync(base,{recursive:true,force:true}); }
});

test("A failed link operation rolls back only the resources created by that init",async t=>{
  const {initializeProject,initialize}=await import("../workbench/src/backend/services/workspace.mjs");
  for(const existing of [false,true]) {
    const project=fs.mkdtempSync(path.join(os.tmpdir(),"dh-init-rollback-"));
    try {
      if(existing)initialize(project);
      fs.writeFileSync(path.join(project,"business.txt"),"keep");
      const symlink=fs.symlinkSync;let count=0;
      t.mock.method(fs,"symlinkSync",(...args)=>{if(++count===3)throw new Error("link fixture failure");return symlink(...args);});
      assert.throws(()=>initializeProject(project),/link fixture failure/);
      assert.equal(fs.existsSync(path.join(project,"design-harness")),existing);assert.equal(fs.existsSync(path.join(project,".agents")),false);
      assert.equal(fs.readFileSync(path.join(project,"business.txt"),"utf8"),"keep");
    } finally { t.mock.restoreAll();fs.rmSync(project,{recursive:true,force:true}); }
  }
});
