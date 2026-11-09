import {test, describe, beforeEach, afterEach} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {unzipSync} from "fflate";
import {packagePlugin} from "../scripts/package-plugin.js";
import {ROOT, SKILL_NAMES, SHARED_FILES, SHARED_NOTICES, requiredSkillFiles, validate, validateSkill} from "../scripts/validate.js";

const ignored = new Set([".git", "dist", ".design-harness", "design-harness", "node_modules", "coverage", ".nyc_output", ".DS_Store"]);
const digest = data => createHash("sha256").update(data).digest("hex");
const readJson = filename => JSON.parse(fs.readFileSync(filename, "utf8"));

describe("Plugin distribution", () => {
  let base;
  let root;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "design-harness-test-"));
    root = path.join(base, "source", "design-harness");
    fs.cpSync(ROOT, root, {recursive: true, filter: filename => {
      const parts = path.relative(ROOT, filename).split(path.sep);
      return !parts.some(part => ignored.has(part)) &&
        ![".harness", "openspec"].includes(parts[0]) &&
        !(parts[0] === ".agents" && parts.length > 1 && parts[1] !== "plugins");
    }});
  });
  afterEach(() => fs.rmSync(base, {recursive: true, force: true}));

  test("Source and versioned cache layouts validate", () => {
    assert.deepEqual(validate(root), []);
    const {version} = readJson(path.join(root, ".codex-plugin/plugin.json"));
    const cache = path.join(base, "cache", "design-harness", version);
    fs.cpSync(root, cache, {recursive: true});
    assert.deepEqual(validate(cache), []);
  });

  test("Retired skill remnants prevent packaging even without an entrypoint", () => {
    const legacy = path.join(root, "skills/design-harness-writeback/references");
    fs.mkdirSync(legacy, {recursive: true});
    fs.writeFileSync(path.join(legacy, "workflow.md"), "Retired workflow.\n");
    assert.ok(validate(root).some(error => error.includes("Retired Writeback skill")));
    assert.throws(() => packagePlugin(path.join(base, "out"), root), /Retired Writeback skill/);
  });

  test("Each phase requires explicit invocation in its distributed metadata", () => {
    for (const name of SKILL_NAMES) {
      const filename = path.join(root, "skills", name, "agents/openai.yaml");
      const original = fs.readFileSync(filename, "utf8");
      for (const replacement of ["allow_implicit_invocation: true", ""]) {
        fs.writeFileSync(filename, original.replace("allow_implicit_invocation: false", replacement));
        assert.ok(validate(root).some(error => error.includes("require explicit invocation")), name);
      }
      fs.writeFileSync(filename, original);
    }
  });

  test("Packaged marketplace validates and runs after extraction to a new location", () => {
    const result = packagePlugin(path.join(base, "out"), root);
    const archive = fs.readFileSync(result.archive);
    assert.equal(digest(archive), result.sha256);
    assert.equal(fs.readFileSync(result.archive + ".sha256", "utf8"), result.sha256 + "  design-harness.zip\n");
    const extracted = path.join(base, "new location");
    for (const [name, data] of Object.entries(unzipSync(archive))) {
      assert.ok(!path.posix.isAbsolute(name) && !name.split("/").includes("..") && !name.includes("\\"));
      const filename = path.join(extracted, name);
      fs.mkdirSync(path.dirname(filename), {recursive: true});
      fs.writeFileSync(filename, data);
    }
    const marketRoot = path.join(extracted, "design-harness");
    const market = readJson(path.join(marketRoot, ".agents/plugins/marketplace.json"));
    const plugin = path.resolve(marketRoot, market.plugins[0].source.path);
    assert.equal(market.name, "design-harness");
    assert.deepEqual(validate(plugin), []);
    const install=spawnSync("npm",["ci","--ignore-scripts","--include=dev","--offline","--no-audit","--no-fund"],{cwd:plugin,encoding:"utf8"});assert.equal(install.status,0,install.stderr);
    for(const name of SKILL_NAMES) {
      const entry=path.join(plugin,"skills",name,"SKILL.md"),links=[...fs.readFileSync(entry,"utf8").matchAll(/\[[^\]]*\]\(([^)]+\/cli\.mjs)\)/g)];
      assert.equal(links.length,1,name+" must link the shared CLI");
      const cli=path.resolve(path.dirname(entry),links[0][1]);assert.equal(cli,path.join(plugin,"workbench/cli.mjs"));
      if(["design-harness-product","design-harness-implement"].includes(name)) {
        const project=path.join(base,"空项目 "+name);fs.mkdirSync(project);
        const located=spawnSync(process.execPath,[cli,"skills",name,"--project",project],{cwd:base,encoding:"utf8"});
        assert.equal(located.status,0,located.stderr);assert.equal(JSON.parse(located.stdout).skills[0].entry,fs.realpathSync(entry));
        assert.deepEqual(fs.readdirSync(project),[]);
        continue;
      }
      const project=path.join(base,"业务 项目 "+name);fs.mkdirSync(project);
      const run=(...args)=>spawnSync(process.execPath,[cli,...args,"--project",project],{cwd:base,encoding:"utf8"});
      const initialized=run("init","--example");assert.equal(initialized.status,0,initialized.stderr);
      const built=run("check");assert.equal(built.status,0,built.stderr);assert.equal(fs.existsSync(path.join(project,"design-harness/studio")),false);
      if(name===SKILL_NAMES[0]){const types=run("typecheck");assert.equal(types.status,0,types.stderr);const output=path.join(base,"exported-example.html"),exported=run("export","example","--out",output);assert.equal(exported.status,0,exported.stderr);assert.match(fs.readFileSync(output,"utf8"),/<!doctype html>/i);assert.equal(fs.existsSync(path.join(project,"design-harness/releases")),false);}
    }
    const resultProcess = spawnSync(process.execPath, ["scripts/validate.js"], {cwd: plugin, encoding: "utf8"});
    assert.equal(resultProcess.status, 0, resultProcess.stdout + resultProcess.stderr);
    assert.deepEqual(fs.readdirSync(path.join(plugin, "skills")).sort(), [...SKILL_NAMES].sort());
    assert.equal(readJson(path.join(plugin, "package.json")).scripts.validate, "node scripts/validate.js");
    assert.ok(fs.existsSync(path.join(plugin, "package-lock.json")));
    const {interface: branding} = readJson(path.join(plugin, ".codex-plugin/plugin.json"));
    for (const field of ["composerIcon", "logo", "logoDark"]) {
      assert.deepEqual(fs.readFileSync(path.join(plugin, branding[field])), fs.readFileSync(path.join(root, branding[field])));
    }
    for (const relative of SHARED_FILES.map(file => "shared/" + file)) {
      assert.deepEqual(fs.readFileSync(path.join(plugin, relative)), fs.readFileSync(path.join(root, relative)));
    }
    for (const relative of SKILL_NAMES.flatMap(name => requiredSkillFiles(name).map(file => `skills/${name}/${file}`))) {
      assert.deepEqual(fs.readFileSync(path.join(plugin, relative)), fs.readFileSync(path.join(root, relative)));
    }
  });

  test("Missing, escaping and non-PNG branding assets prevent packaging", () => {
    const filename = path.join(root, ".codex-plugin/plugin.json");
    const original = fs.readFileSync(filename);
    const manifest = readJson(filename);
    for (const value of ["./assets/missing.png", "./assets/../LICENSE", "https://example.com/icon.png"]) {
      manifest.interface.composerIcon = value;
      fs.writeFileSync(filename, JSON.stringify(manifest));
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /interface asset/);
    }
    fs.writeFileSync(filename, original);
    const icon = path.join(root, readJson(filename).interface.composerIcon);
    for (const bytes of [Buffer.alloc(0), Buffer.from("not a PNG")]) {
      fs.writeFileSync(icon, bytes);
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /Invalid PNG interface asset/);
    }
  });

  test("Branding cannot rely on a symlink outside the plugin", () => {
    const {interface: branding} = readJson(path.join(root, ".codex-plugin/plugin.json"));
    const icon = path.join(root, branding.logo);
    const external = path.join(base, "external.png");
    fs.renameSync(icon, external);
    fs.symlinkSync(external, icon);
    assert.throws(() => packagePlugin(path.join(base, "out"), root), /symlinked interface asset/);
  });

  test("Builds are deterministic and refuse to overwrite either output", () => {
    const first = packagePlugin(path.join(base, "one"), root);
    const second = packagePlugin(path.join(base, "two"), root);
    assert.equal(first.sha256, second.sha256);
    const original = fs.readFileSync(first.archive);
    assert.throws(() => packagePlugin(path.join(base, "one"), root), /already exists/);
    assert.deepEqual(fs.readFileSync(first.archive), original);
    fs.unlinkSync(first.archive);
    const checksum = fs.readFileSync(first.archive + ".sha256");
    assert.throws(() => packagePlugin(path.join(base, "one"), root), /already exists/);
    assert.ok(!fs.existsSync(first.archive));
    assert.deepEqual(fs.readFileSync(first.archive + ".sha256"), checksum);
  });

  test("Archive bytes do not depend on timezone or source modification times", () => {
    const moduleUrl = pathToFileURL(path.join(ROOT, "scripts/package-plugin.js")).href;
    const code = `import {packagePlugin} from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify(packagePlugin(process.argv[1], process.argv[2])));`;
    const builds = [];
    for (const zone of ["UTC", "Pacific/Kiritimati"]) {
      fs.utimesSync(path.join(root, "README.md"), new Date(), new Date());
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", code,
        path.join(base, zone.replaceAll("/", "-")), root], {env: {...process.env, TZ: zone}, encoding: "utf8"});
      assert.equal(result.status, 0, result.stderr);
      builds.push(JSON.parse(result.stdout));
    }
    assert.equal(builds[0].sha256, builds[1].sha256);
  });

  test("Unicode paths and binary resources survive packaging without changing bytes", () => {
    const resource = "shared/workspace/assets/样例 图片.bin";
    const bytes = Buffer.from([0, 1, 128, 254, 255, 0, 13, 10]);
    fs.mkdirSync(path.dirname(path.join(root, resource)), {recursive: true});
    fs.writeFileSync(path.join(root, resource), bytes);
    fs.appendFileSync(path.join(root, "skills/design-harness-init/SKILL.md"),
      "\n[样例](<../../shared/workspace/assets/" + encodeURIComponent("样例 图片.bin") + ">)\n");
    assert.deepEqual(validate(root), []);
    const result = packagePlugin(path.join(base, "out"), root);
    const files = unzipSync(fs.readFileSync(result.archive));
    assert.deepEqual(Buffer.from(files["design-harness/plugins/design-harness/" + resource]), bytes);
  });

  test("Working data, dependencies and generated files are excluded", () => {
    const marker = Buffer.from("private-fixture-" + path.basename(base));
    for (const relative of ["dist/old.zip", ".design-harness/private.txt", "design-harness/private.txt", "node_modules/unused/README.md",
      "scripts/node_modules/unused/local.txt", "coverage/local.json", ".nyc_output/local.json", ".git/local", "local-note.txt",
      ".agents/private.txt", ".agents/plugins/private.txt"]) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, marker);
    }
    const result = packagePlugin(path.join(base, "out"), root);
    const files = unzipSync(fs.readFileSync(result.archive));
    assert.ok(!Object.values(files).some(data => Buffer.from(data).includes(marker)));
  });

  test("Development harness templates stay outside plugin validation and distribution", () => {
    const templates = [
      ".harness/skills/example/SKILL.md",
      ".harness/skills-state.json",
      ".harness/skills-backups/restore.json",
      "openspec/changes/example/notes.md",
      "openspec/schemas/full/templates/spec.md"
    ];
    for (const relative of templates) {
      const filename = path.join(root, relative);
      fs.mkdirSync(path.dirname(filename), {recursive: true});
      fs.writeFileSync(filename, "[pending artifact](../../brainstorm.md#d-03)\n");
    }
    assert.deepEqual(validate(root), []);
    const result = packagePlugin(path.join(base, "out"), root);
    const files = unzipSync(fs.readFileSync(result.archive));
    assert.ok(!Object.keys(files).some(filename => /\/(?:\.harness|openspec)\//.test(filename)));
    const license = "docs/third-party/devkeel/LICENSE";
    assert.deepEqual(Buffer.from(files["design-harness/plugins/design-harness/" + license]),
      fs.readFileSync(path.join(root, license)));
  });

  test("Symlinked files and directories cannot enter the distribution", () => {
    const file = path.join(base, "outside.txt");
    const directory = path.join(base, "outside-dir");
    fs.writeFileSync(file, "outside fixture");
    fs.mkdirSync(directory);
    for (const relative of ["skills/design-harness-init/references", "docs"]) {
      for (const target of [file, directory]) {
        const link = path.join(root, relative, path.basename(target));
        fs.symlinkSync(target, link, target === directory ? "junction" : "file");
        assert.throws(() => packagePlugin(path.join(base, "out"), root), /symlinked/);
        fs.unlinkSync(link);
      }
    }
  });

  test("Broken internal references are reported with a failing CLI exit", () => {
    fs.appendFileSync(path.join(root, "README.md"), "\n[broken](references/missing.md)\n");
    assert.ok(validate(root).some(error => error.includes("Broken/nonportable")));
    const nested = path.join(root, "docs/openspec/guide.md");
    fs.mkdirSync(path.dirname(nested), {recursive: true});
    fs.writeFileSync(nested, "[broken](missing.md)\n");
    assert.ok(validate(root).some(error => error.includes("docs/openspec/guide.md")));
    const result = spawnSync(process.execPath, ["scripts/validate.js"], {cwd: root, encoding: "utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Broken\/nonportable/);
  });

  test("Invalid marketplace paths and version drift prevent publication", () => {
    const filename = path.join(root, ".agents/plugins/marketplace.json");
    const original = fs.readFileSync(filename);
    const marketplace = readJson(filename);
    marketplace.plugins[0].source.path = "./missing-plugin";
    fs.writeFileSync(filename, JSON.stringify(marketplace));
    assert.throws(() => packagePlugin(path.join(base, "out"), root), /resolve this root plugin/);
    fs.writeFileSync(filename, original);
    const packageFilename = path.join(root, "package.json");
    const manifest = readJson(packageFilename);
    manifest.version = "99.0.0";
    fs.writeFileSync(packageFilename, JSON.stringify(manifest));
    assert.throws(() => packagePlugin(path.join(base, "out"), root), /versions must agree/);
  });

  test("Empty bundled notices prevent packaging", () => {
    const notices=["LICENSE", ...SHARED_NOTICES.map(file => "shared/third-party/" + file), "workbench/vendor/impeccable/LICENSE", "workbench/vendor/impeccable/NOTICE.md"];
    for (const relative of notices) {
      const filename = path.join(root, relative), original = fs.readFileSync(filename);
      fs.writeFileSync(filename, "");
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /[Ee]mpty.*(?:resource|license)/);
      fs.writeFileSync(filename, original);
    }
  });

  test("Missing skills, shared resources or the central CLI prevent packaging", () => {
    for(const relative of [
      ...SKILL_NAMES.map(name => "skills/" + name + "/SKILL.md"),
      "skills/design-harness-implement/references/adaptation.md",
      "workbench/src/frontend/app/App.tsx", "workbench/cli.mjs", ...SHARED_FILES.map(file => "shared/" + file)
    ]) {
      const filename=path.join(root,relative),original=fs.readFileSync(filename);
      fs.unlinkSync(filename);
      assert.throws(()=>packagePlugin(path.join(base,"out"),root),/invalid plugin/);
      fs.writeFileSync(filename,original);
    }
  });

  test("Phase instructions load shared resources only within a complete plugin", () => {
    for(const name of SKILL_NAMES) {
      assert.deepEqual(validateSkill(path.join(root,"skills",name)),[]);
      const isolated=path.join(base,"isolated "+name,name);
      fs.cpSync(path.join(root,"skills",name),isolated,{recursive:true});
      assert.ok(validateSkill(isolated).some(error => error.includes("complete Design Harness plugin")));
      assert.equal(fs.existsSync(path.join(isolated,"scripts/harness.mjs")),false);
    }
  });

  test("A skill cannot reference an existing plugin root document", () => {
    const skill = path.join(root, "skills/design-harness-init");
    fs.appendFileSync(path.join(skill, "SKILL.md"), "\n[external dependency](../../docs/validation.md)\n");
    assert.ok(validateSkill(skill).some(error => error.includes("escapes skill")));
  });

  test("A skill cannot reference a sibling skill", () => {
    const skill = path.join(root, "skills/design-harness-init");
    fs.appendFileSync(path.join(skill, "SKILL.md"), "\n[sibling dependency](../design-harness-interaction/references/interview.md)\n");
    assert.ok(validateSkill(skill).some(error => error.includes("escapes skill")));
  });

  test("Unreachable skill references are detected", () => {
    const skill = path.join(root, "skills/design-harness-init");
    fs.writeFileSync(path.join(skill, "references/unused.md"), "Important guidance with no loading path.\n");
    assert.ok(validateSkill(skill).some(error => error.includes("Unreachable skill reference")));
  });

  test("Shared resources cannot escape through symlinks or cross-skill links", () => {
    const file=path.join(root,"shared/references/protocol.md"), original=fs.readFileSync(file);
    const outside=path.join(base,"protocol.md");fs.writeFileSync(outside,original);fs.unlinkSync(file);fs.symlinkSync(outside,file);
    assert.ok(validate(root).some(error=>error.includes("symlinked shared")));
    assert.throws(()=>packagePlugin(path.join(base,"out"),root),/symlinked shared/);
    fs.unlinkSync(file);fs.writeFileSync(file,original);
    fs.appendFileSync(file,"\n[phase](../../skills/design-harness-visual/references/workflow.md)\n");
    assert.ok(validate(root).some(error=>error.includes("escapes skill/shared")));
  });

  test("Duplicate per-skill copies and unreachable shared guidance are rejected", () => {
    const skill=path.join(root,"skills",SKILL_NAMES[0]),copy=path.join(skill,"assets/workspace");
    fs.cpSync(path.join(root,"shared/workspace"),copy,{recursive:true});
    assert.ok(validate(root).some(error=>error.includes("keeping a copy")));
    fs.rmSync(copy,{recursive:true});
    fs.writeFileSync(path.join(root,"shared/references/unused.md"),"Unreachable shared guidance.\n");
    assert.ok(validate(root).some(error=>error.includes("Unreachable shared reference")));
  });

  test("Invalid shared resource protocol or embedded tool code prevents distribution", () => {
    const source=path.join(root,"shared/workspace"),file=path.join(source,"project.json"),original=fs.readFileSync(file);
    fs.writeFileSync(file,JSON.stringify({schemaVersion:99,renderer:"json-render/react"}));
    assert.throws(()=>packagePlugin(path.join(base,"out"),root),/business resource template/);
    fs.writeFileSync(file,original);fs.mkdirSync(path.join(source,"studio"));
    assert.throws(()=>packagePlugin(path.join(base,"out"),root),/must not contain workbench code/);
  });
});
