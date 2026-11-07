import {describe,test,beforeEach,afterEach} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {dependencyDirectory,installDependencies} from "../workbench/src/backend/adapters/dependencies.mjs";
import {initialize,workspacePath,createRequirement,cloneCandidate} from "../workbench/src/backend/services/workspace.mjs";
import {exportHtml,exportToFile} from "../workbench/src/backend/services/export.mjs";
import {loadRequirement} from "../workbench/src/backend/adapters/resource-store.mjs";
import {readJson,hash,filesIn} from "../workbench/src/backend/adapters/filesystem.mjs";
import {checkSpec} from "../workbench/src/contracts/resources.mjs";
import {buildRequirement,checkWorkspace} from "../workbench/src/backend/services/preview.mjs";
import {startServer} from "../workbench/src/backend/http/server.mjs";
import {typecheck} from "../workbench/src/backend/adapters/typecheck.mjs";
const tool=path.resolve(import.meta.dirname,"../workbench");
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+"\n");
describe("Fixed workbench and independent business resources",()=>{
  let base,workspace,req;
  beforeEach(()=>{base=fs.mkdtempSync(path.join(os.tmpdir(),"design resources "));fs.writeFileSync(path.join(base,"business.ts"),"export const business='untouched';");workspace=initialize(base,{example:true}).workspace;req=path.join(workspace,"requirements/example");});
  afterEach(()=>fs.rmSync(base,{recursive:true,force:true}));
  const specFile=()=>path.join(req,"candidates/comfortable/pages/task.json");
  test("Multi-page exports embed each candidate program once and retain every page spec",async()=>{
    const first=await buildRequirement(workspace,"example"),manifest=readJson(path.join(req,"manifest.json")),scenarios=readJson(path.join(req,"scenarios.json"));
    for(let index=1;index<14;index++){
      const id="page-"+index;manifest.pages.push({id,title:"页面 "+index});
      scenarios.push({id,page:id,title:"初始",state:{phase:"new"}});
      for(const candidate of manifest.candidates){const file="candidates/"+candidate.id+"/pages/"+id+".json";fs.copyFileSync(path.join(req,candidate.pages.task),path.join(req,file));candidate.pages[id]=file;}
    }
    write(path.join(req,"manifest.json"),manifest);
    write(path.join(req,"scenarios.json"),scenarios);
    const built=await buildRequirement(workspace,"example"),wire=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(built.html)[1]);
    assert.deepEqual(Object.keys(wire.previews).sort(),manifest.candidates.map(candidate=>candidate.id).sort());
    assert.equal(Object.keys(wire.specs).length,28);
    assert.ok(built.html.length<first.html.length*1.5,"增加页面不能重复嵌入组件、字体和图片");
    for(const candidate of manifest.candidates)assert.match(wire.previews[candidate.id],/<!doctype html>/);
  });
  test("Initialization generates business resources only and refuses overwrite",()=>{
    assert.throws(()=>initialize(base),/拒绝覆盖/);assert.throws(()=>createRequirement(workspace,"example"),/拒绝覆盖/);
    for(const name of ["studio","workbench","node_modules","package-lock.json","tsconfig.json","releases"])assert.equal(fs.existsSync(path.join(workspace,name)),false,name);
    assert.equal(readJson(path.join(workspace,"project.json")).renderer,"json-render/react");assert.equal(fs.readFileSync(path.join(base,"business.ts"),"utf8"),"export const business='untouched';");
  });
  test("Protocol rejects invalid references, cycles, controls and shared candidate paths",()=>{
    const file=path.join(req,"manifest.json"),original=readJson(file);
    for(const mutate of [m=>m.pages.push({...m.pages[0]}),m=>m.controls[0].property="__proto__",m=>m.viewports[0].width=200,m=>m.candidates[1].pages.task=m.candidates[0].pages.task,m=>m.candidates[0].pages={}]){const m=structuredClone(original);mutate(m);write(file,m);assert.throws(()=>loadRequirement(workspace,"example"));}
    write(file,original);const spec=readJson(specFile());spec.elements['task-page'].children.push('task-page');assert.throws(()=>checkSpec(spec),/循环/);
    const doc=path.join(req,"interactions/task.md");fs.writeFileSync(doc,fs.readFileSync(doc,"utf8").replace("## 输入与校验 {#input}","## 输入与校验 {#missing-section}"));assert.throws(()=>loadRequirement(workspace,"example"),/缺少正文/);
  });
  test("An engineering project.json is preserved and never mistaken for the resource entry",async()=>{
    const file=path.join(base,"project.json"),source={name:"engineering-project",targets:{build:{executor:"project-builder"}}};write(file,source);assert.equal(workspacePath(base),workspace);assert.equal(workspacePath(workspace),workspace);assert.equal((await checkWorkspace(workspacePath(base))).requirements,1);assert.deepEqual(readJson(file),source);
  });
  test("Existing data URL assets remain inline and offline",async()=>{
    const file=path.join(req,"candidates/comfortable/components/task.css");fs.appendFileSync(file,'\n.task-page{background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E");}');const {html}=await buildRequirement(workspace,"example");assert.match(html,/data:image\/svg\+xml/);
  });
  test("One shared foundation updates existing requirements without copying source",async()=>{
    assert.equal(fs.existsSync(path.join(req,"foundation")),false);const before=loadRequirement(workspace,"example");
    fs.appendFileSync(path.join(workspace,"foundation/tokens.css"),"\n:root{--shared-update:1}");write(path.join(workspace,"foundation/foundation.json"),{schemaVersion:1,version:"0.2.0",status:"draft"});
    const after=loadRequirement(workspace,"example");assert.equal(after.manifest.foundationVersion,"0.2.0");assert.notEqual(after.revision,before.revision);assert.match((await buildRequirement(workspace,"example")).html,/--shared-update/);assert.equal(fs.existsSync(path.join(req,"foundation")),false);
  });
  test("Candidate clone copies complete specs, parameters and implementations independently",async()=>{
    cloneCandidate(workspace,"example","comfortable","alternative","另一候选");const next=path.join(req,"candidates/alternative"),other=fs.readFileSync(specFile()),params=fs.readFileSync(path.join(req,"candidates/comfortable/params.json"));
    const spec=readJson(path.join(next,"pages/task.json"));spec.elements['task-page'].props.title="独立新方案";write(path.join(next,"pages/task.json"),spec);write(path.join(next,"params.json"),{css:{"--body-size":"16px"}});fs.appendFileSync(path.join(next,"components/Task.tsx"),"\n// private implementation\n");
    const {payload}=await buildRequirement(workspace,"example");assert.equal(payload.specs['alternative:task'].elements['task-page'].props.title,"独立新方案");assert.deepEqual(fs.readFileSync(specFile()),other);assert.deepEqual(fs.readFileSync(path.join(req,"candidates/comfortable/params.json")),params);assert.throws(()=>cloneCandidate(workspace,"example","comfortable","alternative"),/已存在/);
  });
  test("Build embeds project components, specs, styles and assets with safe Markdown",async()=>{
    const before=fs.readFileSync(path.join(tool,"src/frontend/app/App.tsx")),page=path.join(req,"candidates/comfortable/components/Task.tsx"),image=path.join(path.dirname(page),"example.svg");fs.writeFileSync(image,'<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"/></svg>');
    fs.writeFileSync(page,'import graphic from "./example.svg";\n'+fs.readFileSync(page,"utf8").replace('<main className="task-page">','<main className="task-page"><img src={graphic} alt="样例"/>'));fs.appendFileSync(path.join(req,"requirement.md"),'\n<script>window.INJECTED=1</script>\n[bad](javascript:alert(1))\n');
    const {html,payload}=await buildRequirement(workspace,"example");assert.match(html,/data:image\/svg\+xml/);assert.match(payload.documentation,/id="overview-input"/);assert.doesNotMatch(payload.documentation,/<script>|href="javascript:/);assert.match(html,/Third-party licenses/);assert.equal(payload.token,undefined);assert.deepEqual(fs.readFileSync(path.join(tool,"src/frontend/app/App.tsx")),before);
  });
  test("Candidate code shares public foundation but cannot import business source or another candidate",async()=>{
    const page=path.join(req,"candidates/comfortable/components/Task.tsx"),source=fs.readFileSync(page,"utf8");
    for(const entry of [path.join(base,"business.ts"),path.join(req,"candidates/compact/components/Task.tsx")]){fs.writeFileSync(page,'import '+JSON.stringify(entry)+';\n'+source);await assert.rejects(buildRequirement(workspace,"example"),/越界/);}
    fs.writeFileSync(page,source);const css=path.join(req,"candidates/comfortable/components/task.css");fs.writeFileSync(css,'@import "https://example.com/outside.css";\n'+fs.readFileSync(css,'utf8'));await assert.rejects(buildRequirement(workspace,"example"),/外部资源/);
  });
  test("Symlinked resources are refused",()=>{fs.symlinkSync(path.join(base,"business.ts"),path.join(req,"escape.ts"));assert.throws(()=>loadRequirement(workspace,"example"),/软链接/);});
  test("A broken sibling draft does not block selected preview, but explicit all-project check fails",async()=>{createRequirement(workspace,"aaa-broken");fs.unlinkSync(path.join(workspace,"requirements/aaa-broken/manifest.json"));const {payload}=await buildRequirement(workspace,"example",{development:true});assert.ok(payload.requirements.some(r=>r.id==="aaa-broken"));await assert.rejects(checkWorkspace(workspace));const service=await startServer(workspace,{port:0});try{assert.equal((await fetch(service.origin)).status,200);}finally{await service.close();}});
  test("Typechecking covers fixed tool, public foundation and project components from outside the plugin",async()=>{assert.ok((await typecheck(workspace)).files>10);const file=path.join(req,"candidates/comfortable/components/Task.tsx");fs.appendFileSync(file,'\nconst wrong: number="text";\n');await assert.rejects(typecheck(workspace),/类型检查失败/);});
  test("Local API targets the right spec, validates edits and rejects stale or unauthorized writes",async()=>{
    const service=await startServer(workspace,{port:0});try{
      const html=await(await fetch(service.origin)).text(),payload=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(html)[1]),other=fs.readFileSync(path.join(req,"candidates/compact/pages/task.json"));
      const post=(body,origin=service.origin,token=payload.token)=>fetch(service.origin+"/__dh/spec",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"X-DH-Token":token},body:JSON.stringify(body)});
      const body={id:"example",candidate:"comfortable",page:"task",expectedHash:payload.hashes['comfortable:task'],values:{radius:20,gap:28,heading:"实例标题"}};
      assert.equal((await fetch(service.origin+"/__dh/live/jobs/"+"1".repeat(32))).status,403);assert.equal((await fetch(service.origin+"/__dh/live/events",{method:"POST",headers:{Origin:service.origin,"Content-Type":"application/json"},body:JSON.stringify({type:"generate"})})).status,403);
      assert.equal((await post(body,"https://example.com")).status,400);assert.equal((await post(body,service.origin,"bad")).status,403);
      assert.equal((await post({...body,values:{radius:5}})).status,400);assert.equal((await post({...body,values:{unregistered:1}})).status,400);assert.equal((await post({...body,candidate:"../outside"})).status,400);
      assert.equal((await post(body)).status,200);assert.equal(readJson(specFile()).elements['task-form'].props.radius,20);assert.equal(readJson(specFile()).elements['task-page'].props.title,"实例标题");assert.deepEqual(fs.readFileSync(path.join(req,"candidates/compact/pages/task.json")),other);
      assert.equal((await post(body)).status,409);const next={...body,expectedHash:hash(fs.readFileSync(specFile()))};fs.appendFileSync(specFile(),"\n");assert.equal((await post(next)).status,409);
    }finally{await service.close();}
  });
  test("Concurrent edits share compare-and-swap instead of overwriting",async()=>{const service=await startServer(workspace,{port:0});try{const data=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(await(await fetch(service.origin)).text())[1]),body={id:"example",candidate:"comfortable",page:"task",expectedHash:data.hashes['comfortable:task']};const responses=await Promise.all([20,22].map(radius=>fetch(service.origin+"/__dh/spec",{method:"POST",headers:{Origin:service.origin,"X-DH-Token":data.token,"Content-Type":"application/json"},body:JSON.stringify({...body,values:{radius}})})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);}finally{await service.close();}});
  test("Export returns one offline HTML without creating files or changing source revision",async()=>{
    const before=filesIn(workspace).map(file=>[path.relative(workspace,file),hash(fs.readFileSync(file))]),revision=loadRequirement(workspace,"example").revision;
    const result=await exportHtml(workspace,"example"),payload=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(result.html)[1]);assert.equal(result.filename,"example.html");assert.equal(payload.development,false);assert.equal(payload.token,undefined);assert.equal(Object.keys(payload.previews).length,2);assert.match(result.html,/Third-party licenses/);
    assert.deepEqual(filesIn(workspace).map(file=>[path.relative(workspace,file),hash(fs.readFileSync(file))]),before);assert.equal(loadRequirement(workspace,"example").revision,revision);assert.equal(fs.existsSync(path.join(workspace,"releases")),false);
    await assert.rejects(exportHtml(workspace,"../../outside"),/需求 ID/);
  });
  test("Re-export uses current requirement and shared foundation and replaces only the selected output file",async()=>{
    const output=path.join(base,"preview.html"),first=await exportToFile(workspace,"example",output),before=fs.readFileSync(output);assert.equal(first.file,fs.realpathSync(output));
    fs.appendFileSync(path.join(workspace,"foundation/tokens.css"),"\n:root{--compatible-new-token:2}");const spec=readJson(specFile());spec.elements['task-page'].props.title="current requirement title";write(specFile(),spec);
    await exportToFile(workspace,"example",output);assert.notDeepEqual(fs.readFileSync(output),before);assert.match(fs.readFileSync(output,"utf8"),/--compatible-new-token/);assert.match(fs.readFileSync(output,"utf8"),/current requirement title/);assert.equal(fs.existsSync(path.join(workspace,"releases")),false);assert.equal(fs.readdirSync(base).filter(name=>name.endsWith(".tmp")).length,0);
    const validOutput=fs.readFileSync(output);spec.elements['task-page'].children.push('task-page');write(specFile(),spec);await assert.rejects(exportToFile(workspace,"example",output),/循环/);assert.deepEqual(fs.readFileSync(output),validOutput);
  });
  test("HTTP export is an authenticated HTML attachment and never writes a server path",async()=>{
    const service=await startServer(workspace,{port:0});try{
      const data=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(await(await fetch(service.origin)).text())[1]),before=filesIn(workspace).map(file=>[file,hash(fs.readFileSync(file))]);
      const post=(token=data.token,origin=service.origin)=>fetch(service.origin+"/__dh/export",{method:"POST",headers:{Origin:origin,"X-DH-Token":token,"Content-Type":"application/json"},body:JSON.stringify({id:"example",out:path.join(base,"unexpected.html")})});
      assert.equal((await post("bad")).status,403);assert.equal((await post(data.token,"https://example.com")).status,400);const response=await post();assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/text\/html/);assert.equal(response.headers.get("content-disposition"),'attachment; filename="example.html"');const html=await response.text();assert.match(html,/<!doctype html>/i);assert.doesNotMatch(html,RegExp(data.token));assert.equal(fs.existsSync(path.join(base,"unexpected.html")),false);assert.deepEqual(filesIn(workspace).map(file=>[file,hash(fs.readFileSync(file))]),before);assert.equal((await fetch(service.origin+"/releases/example/v2/index.html")).status,404);
    }finally{await service.close();}
  });
  test("CLI requires an external HTML output and removes version archive commands",()=>{
    const run=(...args)=>spawnSync(process.execPath,[path.join(tool,"cli.mjs"),...args,"--project",base],{encoding:"utf8"}),output=path.join(base,"cli-preview.html");
    for(const args of [["export","example"],["export","example","v2","--out",output],["rebuild","example","v2"],["verify",workspace]])assert.notEqual(run(...args).status,0);
    const result=run("export","example","--out",output);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).file,fs.realpathSync(output));assert.match(fs.readFileSync(output,"utf8"),/<!doctype html>/i);assert.equal(fs.existsSync(path.join(workspace,"releases")),false);
  });
  test("Project extension declarations cannot replace fixed runtime or execute scripts",()=>{
    const file=path.join(workspace,"package.json");
    for(const pkg of [{dependencies:{react:"19.3.1"}},{dependencies:{clsx:"^2.1.1"}},{dependencies:{},scripts:{install:"unexpected"}}]){write(file,pkg);assert.throws(()=>dependencyDirectory(workspace));}
    write(file,{dependencies:{clsx:"2.1.1"}});assert.throws(()=>dependencyDirectory(workspace),/资源不存在|未安装/);assert.equal(fs.existsSync(path.join(workspace,"node_modules")),false);
  });
  test("Extension dependencies keep browser resolution and require an explicit matching lock",async()=>{
    const file=path.join(workspace,"package.json");write(file,{dependencies:{clsx:"2.1.1"}});installDependencies(workspace);
    write(file,{dependencies:{clsx:"2.1.1",nanoid:"3.3.19"}});assert.throws(()=>dependencyDirectory(workspace),/锁与声明不一致/);assert.throws(()=>installDependencies(workspace,{frozen:true}),/固定锁文件/);
    installDependencies(workspace);const lock=fs.readFileSync(path.join(workspace,"dependencies.lock.json"));installDependencies(workspace,{frozen:true});assert.deepEqual(fs.readFileSync(path.join(workspace,"dependencies.lock.json")),lock);
    const fileComponent=path.join(req,"candidates/comfortable/components/Task.tsx");fs.writeFileSync(fileComponent,'import {nanoid} from "nanoid";\n'+fs.readFileSync(fileComponent,"utf8").replace('<main className="task-page">','<main className="task-page" data-extension={nanoid()}>'));
    const {html}=await buildRequirement(workspace,"example");assert.ok(html.includes("nanoid 3.3.19"));assert.equal(fs.existsSync(path.join(workspace,"node_modules")),false);assert.ok(!dependencyDirectory(workspace).startsWith(workspace));
  });
  test("Concurrent download builds return complete HTML without creating archive directories",async()=>{const before=filesIn(workspace).length,results=await Promise.all([exportHtml(workspace,"example"),exportHtml(workspace,"example")]);assert.equal(results[0].html,results[1].html);assert.equal(filesIn(workspace).length,before);assert.equal(fs.existsSync(path.join(workspace,"releases")),false);});
  test("Output paths cannot overwrite resource files, directories or symbolic links",async()=>{
    const sourceOutput=path.join(req,"preview.html");await assert.rejects(exportToFile(workspace,"example",sourceOutput),/资源目录之外/);assert.equal(fs.existsSync(sourceOutput),false);
    const realFile=path.join(base,"original.html"),link=path.join(base,"link.html");fs.writeFileSync(realFile,"unchanged");fs.symlinkSync(realFile,link);await assert.rejects(exportToFile(workspace,"example",link),/软链接/);assert.equal(fs.readFileSync(realFile,"utf8"),"unchanged");
    const alias=path.join(base,"resources-alias");fs.symlinkSync(workspace,alias);await assert.rejects(exportToFile(workspace,"example",path.join(alias,"preview.html")),/资源目录之外/);
    const folder=path.join(base,"folder.html");fs.mkdirSync(folder);await assert.rejects(exportToFile(workspace,"example",folder),/普通文件/);await assert.rejects(exportToFile(workspace,"example",path.join(base,"wrong.json")),/扩展名/);await assert.rejects(exportToFile(workspace,"example"),/--out/);
  });
});
