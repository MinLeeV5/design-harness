import {describe,test,beforeEach,afterEach} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {initialize} from "../skills/design-harness-init/scripts/harness.mjs";
import {loadRequirement,readJson,hash} from "../skills/design-harness-init/assets/workspace/studio/lib/protocol.mjs";
import {buildRequirement} from "../skills/design-harness-init/assets/workspace/studio/lib/build.mjs";
import {createRequirement,upgradeRequirement,exportRelease,verifyRelease} from "../skills/design-harness-init/assets/workspace/studio/lib/workspace.mjs";
import {startServer} from "../skills/design-harness-init/assets/workspace/studio/lib/server.mjs";
const root=path.resolve(import.meta.dirname,"..");
describe("Independent HTML design workspace",()=>{
  let base,workspace;
  beforeEach(()=>{
    fs.mkdirSync(path.join(root,"dist"),{recursive:true});
    base=fs.mkdtempSync(path.join(root,"dist","workspace test "));
    fs.writeFileSync(path.join(base,"business.ts"),"export const business = 'untouched';");
    workspace=initialize(base).workspace;
    createRequirement(workspace,"sample","示例需求");
  });
  afterEach(()=>fs.rmSync(base,{recursive:true,force:true}));
  const jsonWrite=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+"\n");
  test("Initialization refuses overwrite and leaves business files untouched",()=>{
    assert.throws(()=>initialize(base),/拒绝覆盖/);
    assert.equal(fs.readFileSync(path.join(base,"business.ts"),"utf8"),"export const business = 'untouched';");
    assert.equal(readJson(path.join(workspace,"requirements/sample/manifest.json")).id,"sample");
    assert.throws(()=>createRequirement(workspace,"sample"),/拒绝覆盖/);
  });
  test("Protocol rejects duplicate IDs, broken annotations and invalid candidate values",()=>{
    const manifestPath=path.join(workspace,"requirements/sample/manifest.json");
    const original=readJson(manifestPath);
    for(const mutate of [
      m=>m.pages.push({...m.pages[0]}),
      m=>m.controls[0].default=5,
      m=>m.viewports[0].width=200,
      m=>m.candidates[1].params=m.candidates[0].params,
      m=>m.pages[0].entry="../business.ts"
    ]) {
      const value=structuredClone(original);mutate(value);jsonWrite(manifestPath,value);
      assert.throws(()=>loadRequirement(workspace,"sample"));
    }
    jsonWrite(manifestPath,original);
    const scenarios=readJson(path.join(workspace,"requirements/sample/scenarios.json"));
    scenarios[0].annotations[0].section="missing-section";
    jsonWrite(path.join(workspace,"requirements/sample/scenarios.json"),scenarios);
    assert.throws(()=>loadRequirement(workspace,"sample"),/说明关联失效/);
  });
  test("Existing requirements keep foundation bytes; explicit upgrade produces a new draft",()=>{
    const original=path.join(workspace,"requirements/sample/foundation/tokens.css");
    const before=fs.readFileSync(original);
    fs.appendFileSync(path.join(workspace,"foundation/tokens.css"),"\n:root{--card-radius:28px}");
    jsonWrite(path.join(workspace,"foundation/foundation.json"),{schemaVersion:1,version:"0.2.0",status:"draft"});
    assert.deepEqual(fs.readFileSync(original),before);
    upgradeRequirement(workspace,"sample","sample-v2");
    assert.equal(loadRequirement(workspace,"sample-v2").manifest.foundationVersion,"0.2.0");
    assert.equal(loadRequirement(workspace,"sample").manifest.foundationVersion,"0.1.0");
    assert.throws(()=>upgradeRequirement(workspace,"sample","sample-v2"),/拒绝覆盖/);
  });
  test("Build embeds styles, images and documentation while preventing script injection from Markdown",async()=>{
    const page=path.join(workspace,"requirements/sample/src/pages/TaskPage.tsx");
    const image=path.join(path.dirname(page),"sample.svg");
    fs.writeFileSync(image,'<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"/></svg>');
    fs.writeFileSync(page,'import graphic from "./sample.svg";\n'+fs.readFileSync(page,"utf8").replace('<main className="task-page">','<main className="task-page"><img src={graphic} alt="示例图形"/>'));
    fs.appendFileSync(path.join(workspace,"requirements/sample/requirement.md"),'\n<script>window.INJECTED=1</script>\n[bad](javascript:alert(1))\n');
    const {html,payload}=await buildRequirement(workspace,"sample");
    assert.match(html,/data:image\/svg\+xml/);
    assert.match(payload.documentation,/id="input"/);
    assert.doesNotMatch(payload.documentation,/<script>|href="javascript:/);
    assert.match(html,/Third-party licenses/);
    assert.equal(payload.development,false);
    assert.equal(payload.token,undefined);
  });
  test("Build rejects business imports, global foundations, symlinks and external CSS assets",async()=>{
    const page=path.join(workspace,"requirements/sample/src/pages/TaskPage.tsx");
    const source=fs.readFileSync(page,"utf8");
    for(const entry of [path.join(base,"business.ts"),path.join(workspace,"foundation/components.tsx")]) {
      fs.writeFileSync(page,'import '+JSON.stringify(entry)+';\n'+source);
      await assert.rejects(buildRequirement(workspace,"sample"),/不得导入/);
    }
    fs.writeFileSync(page,source);
    const asset=path.join(workspace,"requirements/sample/external.ts");
    fs.symlinkSync(path.join(base,"business.ts"),asset);
    assert.throws(()=>loadRequirement(workspace,"sample"),/软链接/);
    fs.unlinkSync(asset);
    const css=path.join(workspace,"requirements/sample/src/pages/task.css");
    fs.writeFileSync(css,'@import "https://example.com/outside.css";\n'+fs.readFileSync(css,"utf8"));
    await assert.rejects(buildRequirement(workspace,"sample"),/外部资源/);
  });
  test("Workbench compilation applies the same design source boundary",async()=>{
    const file=path.join(workspace,"studio/app.tsx");
    fs.writeFileSync(file,'import "../../business.ts";\n'+fs.readFileSync(file,"utf8"));
    await assert.rejects(buildRequirement(workspace,"sample"),/不得导入/);
  });
  test("An unfinished sibling requirement does not block the selected design",async()=>{
    createRequirement(workspace,"unfinished");
    fs.unlinkSync(path.join(workspace,"requirements/unfinished/manifest.json"));
    const {payload}=await buildRequirement(workspace,"sample",{development:true});
    assert.equal(payload.manifest.id,"sample");
    assert.ok(payload.requirements.some(item=>item.id==="unfinished"));
  });
  test("Default local entry skips an unfinished earlier draft",async()=>{
    createRequirement(workspace,"aaa-draft");
    fs.unlinkSync(path.join(workspace,"requirements/aaa-draft/scenarios.json"));
    const service=await startServer(workspace,{port:0});
    try {
      const response=await fetch(service.origin);
      assert.equal(response.status,200);
      assert.match(await response.text(),/window\.__DH_DATA__/);
    } finally {await service.close();}
  });
  test("Release freezes source and dependency lock, rejects overwrite, detects tampering",async()=>{
    const result=await exportRelease(workspace,"sample","v1");
    assert.ok(result.files>20);
    const html=fs.readFileSync(result.html);
    const release=readJson(path.join(result.directory,"release.json"));
    assert.equal(release.acceptance,"not-recorded");
    assert.ok(fs.existsSync(path.join(result.directory,"sources/package-lock.json")));
    verifyRelease(result.directory);
    fs.appendFileSync(path.join(workspace,"requirements/sample/requirement.md"),"\n新增草稿内容\n");
    assert.deepEqual(fs.readFileSync(result.html),html);
    await assert.rejects(exportRelease(workspace,"sample","v1"),/拒绝覆盖/);
    const v2=await exportRelease(workspace,"sample","v2");
    assert.notDeepEqual(fs.readFileSync(v2.html),html);
    fs.appendFileSync(result.html,"changed");
    assert.throws(()=>verifyRelease(result.directory),/字节已改变/);
    await assert.rejects(exportRelease(workspace,"../../outside","v1"),/需求 ID/);
    assert.ok(!fs.existsSync(path.join(base,"outside")));
  });
  test("Concurrent exports cannot overwrite the same version",async()=>{
    const results=await Promise.allSettled([exportRelease(workspace,"sample","v1"),exportRelease(workspace,"sample","v1")]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(results.filter(r=>r.status==="rejected").length,1);
    verifyRelease(path.join(workspace,"releases/sample/v1"));
  });
  test("Symlinked output directories cannot escape the design workspace",async()=>{
    fs.rmSync(path.join(workspace,"releases"),{recursive:true});
    const external=path.join(base,"outside");fs.mkdirSync(external);
    fs.symlinkSync(external,path.join(workspace,"releases"));
    await assert.rejects(exportRelease(workspace,"sample","v1"),/软链接/);
    assert.deepEqual(fs.readdirSync(external),[]);
  });
  test("Local API writes only valid current candidate values and rejects stale or cross-origin edits",async()=>{
    const service=await startServer(workspace,{port:0});
    try {
      const html=await (await fetch(service.origin)).text();
      const payload=JSON.parse(/window\.__DH_DATA__=([\s\S]*?);<\/script>/.exec(html)[1]);
      const post=(body,origin=service.origin,token=payload.token)=>fetch(service.origin+"/__dh/params",{method:"POST",
        headers:{"Content-Type":"application/json","Origin":origin,"X-DH-Token":token},body:JSON.stringify(body)});
      const body={id:"sample",candidate:"comfortable",expectedHash:payload.hashes.comfortable,values:{radius:20,gap:28}};
      assert.equal((await post(body,"https://example.com")).status,400);
      assert.equal((await post(body,service.origin,"invalid")).status,403);
      const saved=await post(body);assert.equal(saved.status,200);
      assert.equal((await post(body)).status,409);
      assert.deepEqual(readJson(path.join(workspace,"requirements/sample/candidates/comfortable.json")),body.values);
      assert.equal((await post({...body,expectedHash:(await saved.json()).hash,values:{radius:999}})).status,400);
      assert.equal((await fetch(service.origin+"/__dh/revision?id=../../outside")).status,400);
    } finally {await service.close();}
  });
});
