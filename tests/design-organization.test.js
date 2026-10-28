import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {initialize,configureOrganization,createRequirement,firstRequirement,defaultDesign,projectOrganization} from "../workbench/src/backend/services/workspace.mjs";
import {loadProject,loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {designOrganization} from "../workbench/src/contracts/design-organization.mjs";
import {createLiveAgentRuntime} from "../workbench/src/backend/services/agent-runtime.mjs";
import {testConnection,memoryPreferences} from "./helpers/codex-connection.mjs";

const cli=new URL("../workbench/cli.mjs",import.meta.url).pathname;
const read=file=>JSON.parse(fs.readFileSync(file,"utf8"));
async function fixture(options,check) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"dh-organization-"));
  try {await check({base,workspace:initialize(base,options).workspace});}
  finally {fs.rmSync(base,{recursive:true,force:true});}
}

test("Initialization persists an explicit choice and keeps unconfirmed and legacy workspaces readable",async()=>{
  await fixture({},({workspace})=>{
    const file=path.join(workspace,"project.json");
    assert.equal(projectOrganization(workspace),null);
    const project=read(file);delete project.designOrganization;project.extra={preserved:true};fs.writeFileSync(file,JSON.stringify(project));
    assert.equal(projectOrganization(workspace),null);
    assert.deepEqual(configureOrganization(workspace,{mode:"continuous"}),{mode:"continuous",primary:"product"});
    assert.deepEqual(loadProject(workspace).extra,{preserved:true});
    assert.equal(fs.existsSync(path.join(workspace,"requirements/product")),false,"确认模式不自动开展业务设计");
  });
  await fixture({mode:"continuous",primary:"application",example:true},({workspace})=>{
    assert.deepEqual(projectOrganization(workspace),{mode:"continuous",primary:"application"});
    assert.equal(loadRequirement(workspace,"example").manifest.purpose,"foundation-preview");
    assert.equal(firstRequirement(workspace),"example");
  });
});

test("Continuous creation requires the primary or an explicit separate request; previews cannot become the primary",async()=>{
  await fixture({mode:"continuous",primary:"product"},({workspace})=>{
    const config=fs.readFileSync(path.join(workspace,"project.json"));
    assert.throws(()=>createRequirement(workspace,"new-feature"),/持续模式.*product.*--separate/);
    assert.equal(fs.existsSync(path.join(workspace,"requirements/new-feature")),false);
    createRequirement(workspace,"aaa-preview","基础预览",{preview:true});
    createRequirement(workspace,"product","产品主稿");
    const primary=loadRequirement(workspace,"product"),before=fs.readFileSync(primary.specFiles["comfortable:task"]);
    createRequirement(workspace,"experiment","独立探索",{separate:true});
    assert.equal(firstRequirement(workspace),"product");
    assert.equal(defaultDesign(workspace),"product");
    assert.equal(defaultDesign(workspace,"experiment"),"experiment");
    assert.deepEqual(fs.readFileSync(path.join(workspace,"project.json")),config);
    assert.deepEqual(fs.readFileSync(primary.specFiles["comfortable:task"]),before);
    assert.throws(()=>configureOrganization(workspace,{mode:"continuous",primary:"aaa-preview"}),/主稿不能指向基础验证预览/);
    assert.throws(()=>createRequirement(workspace,"product","预览",{preview:true}),/主稿不能作为基础预览/);
    assert.deepEqual(fs.readFileSync(path.join(workspace,"project.json")),config);
  });
});

test("Independent requirements remain separate; changing the mode preserves existing resources and changes revisions",async()=>{
  await fixture({mode:"per-requirement"},({workspace})=>{
    createRequirement(workspace,"first");createRequirement(workspace,"second");
    assert.throws(()=>defaultDesign(workspace),/请指定需求 ID/);
    const first=loadRequirement(workspace,"first"),revision=first.revision,bytes=fs.readFileSync(first.specFiles["comfortable:task"]);
    configureOrganization(workspace,{mode:"continuous",primary:"second"});
    assert.equal(firstRequirement(workspace),"second");
    assert.notEqual(loadRequirement(workspace,"first").revision,revision);
    assert.deepEqual(fs.readFileSync(first.specFiles["comfortable:task"]),bytes);
    configureOrganization(workspace,{mode:"per-requirement"});
    assert.deepEqual(projectOrganization(workspace),{mode:"per-requirement"});
    assert.ok(fs.existsSync(path.join(workspace,"requirements/first"))&&fs.existsSync(path.join(workspace,"requirements/second")));
  });
});

test("Invalid modes and primary paths fail without mutating configuration or leaving partial initialization",async()=>{
  for(const value of [{mode:"unknown"},{mode:"continuous"},{mode:"continuous",primary:"../escape"},{mode:"per-requirement",primary:"product"},{mode:"continuous",primary:"ok",extra:true}])assert.throws(()=>designOrganization({designOrganization:value}));
  await fixture({},({base,workspace})=>{
    const file=path.join(workspace,"project.json"),before=fs.readFileSync(file);
    assert.throws(()=>configureOrganization(workspace,{mode:"unknown"}));
    assert.throws(()=>configureOrganization(workspace,{mode:"continuous",primary:"../escape"}));
    assert.deepEqual(fs.readFileSync(file),before);
    const invalid=path.join(base,"invalid");fs.mkdirSync(invalid);
    assert.throws(()=>initialize(invalid,{mode:"unknown"}));
    assert.equal(fs.existsSync(path.join(invalid,"design-harness")),false);
  });
});

test("CLI reads and changes organization, blocks implicit splits, and replaces the stable primary HTML",async()=>{
  await fixture({mode:"continuous",primary:"product"},({base,workspace})=>{
    const run=(...args)=>spawnSync(process.execPath,[cli,...args,"--project",base],{encoding:"utf8"});
    assert.deepEqual(JSON.parse(run("organization").stdout).designOrganization,{mode:"continuous",primary:"product"});
    assert.notEqual(run("new","feature").status,0);
    assert.equal(run("new").status,0);
    assert.equal(run("new","feature","--separate").status,0);
    assert.equal(run("new","foundation-preview","--preview").status,0);
    const output=path.join(base,"product.html"),first=run("export","--out",output);
    assert.equal(first.status,0,first.stderr);const before=fs.readFileSync(output);
    const spec=path.join(workspace,"requirements/product/candidates/comfortable/pages/task.json"),value=read(spec);value.elements["task-page"].props.title="产品累计更新";fs.writeFileSync(spec,JSON.stringify(value));
    const second=run("export","--out",output);assert.equal(second.status,0,second.stderr);
    assert.notDeepEqual(fs.readFileSync(output),before);assert.ok(fs.readFileSync(output,"utf8").includes("产品累计更新"));
    assert.equal(run("organization","--mode","per-requirement").status,0);
    assert.equal(run("new","another").status,0);
    assert.notEqual(run("export","--out",output).status,0);
  });
});

test("Workbench roles receive the saved organization on every turn and cannot change it through proposals",async()=>{
  await fixture({mode:"continuous",primary:"product"},async({workspace})=>{
    createRequirement(workspace,"product");createRequirement(workspace,"experiment","独立探索",{separate:true});
    const calls=[],runtime=createLiveAgentRuntime(workspace,{connection:testConnection(),preferences:memoryPreferences(),capture:async()=>null,run:async input=>{
      calls.push(input);return input.prompt.includes('User message: "修改组织配置"')?{summary:"越界配置",files:[{path:"../../project.json",content:'{}'}],controls:[]}:{summary:"保持当前设计组织方式",files:[],controls:[]};
    }});
    const request=(id,role,prompt="继续设计")=>({type:"message",id,role,candidate:"comfortable",page:"task",capture:{page:"task",state:{}},expectedRevision:loadRequirement(workspace,id).revision,prompt});
    const done=async job=>{const end=Date.now()+10000;while(["running","validating"].includes(runtime.get(job.id).state)){assert.ok(Date.now()<end,"Agent 未完成");await new Promise(resolve=>setTimeout(resolve,10));}return runtime.get(job.id);};
    const context=input=>JSON.parse(input.prompt.match(/^Project design organization: (.+)$/m)[1]);
    try {
      for(const role of ["interaction","visual"]){assert.equal((await done(await runtime.event(request("product",role)))).state,"answered");assert.deepEqual(context(calls.at(-1)),{mode:"continuous",primary:"product",current:"product",purpose:"design"});}
      const trusted=JSON.parse(calls[0].prompt.match(/^Trusted Skill documents: (.+)$/m)[1]);
      assert.equal(trusted.find(doc=>doc.file==="shared/references/design-organization.md").content,fs.readFileSync(new URL("../shared/references/design-organization.md",import.meta.url),"utf8"));
      await done(await runtime.event(request("experiment","interaction")));
      assert.deepEqual(context(calls.at(-1)),{mode:"continuous",primary:"product",current:"experiment",purpose:"design"});
      const file=path.join(workspace,"project.json"),before=fs.readFileSync(file);
      assert.equal((await done(await runtime.event(request("product","interaction","修改组织配置")))).state,"failed");assert.deepEqual(fs.readFileSync(file),before);
      configureOrganization(workspace,{mode:"per-requirement"});
      await done(await runtime.event(request("product","visual")));
      assert.deepEqual(context(calls.at(-1)),{mode:"per-requirement",primary:null,current:"product",purpose:"design"});
    } finally {await runtime.close();}
  });
});
