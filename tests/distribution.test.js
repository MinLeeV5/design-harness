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
import {ROOT, SKILL_NAMES, validate, validateSkill} from "../scripts/validate.js";

const ignored = new Set([".git", "dist", "node_modules", "coverage", ".nyc_output", ".DS_Store"]);
const digest = data => createHash("sha256").update(data).digest("hex");
const readJson = filename => JSON.parse(fs.readFileSync(filename, "utf8"));

describe("Plugin distribution", () => {
  let base;
  let root;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "design-harness-test-"));
    root = path.join(base, "source", "design-harness");
    fs.cpSync(ROOT, root, {recursive: true,
      filter: filename => !path.relative(ROOT, filename).split(path.sep).some(part => ignored.has(part))});
  });
  afterEach(() => fs.rmSync(base, {recursive: true, force: true}));

  test("Source and versioned cache layouts validate", () => {
    assert.deepEqual(validate(root), []);
    const {version} = readJson(path.join(root, ".codex-plugin/plugin.json"));
    const cache = path.join(base, "cache", "design-harness", version);
    fs.cpSync(root, cache, {recursive: true});
    assert.deepEqual(validate(cache), []);
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
    const resultProcess = spawnSync(process.execPath, ["scripts/validate.js"], {cwd: plugin, encoding: "utf8"});
    assert.equal(resultProcess.status, 0, resultProcess.stdout + resultProcess.stderr);
    assert.deepEqual(fs.readdirSync(path.join(plugin, "skills")).sort(), [...SKILL_NAMES].sort());
    assert.equal(readJson(path.join(plugin, "package.json")).scripts.validate, "node scripts/validate.js");
    assert.ok(fs.existsSync(path.join(plugin, "package-lock.json")));
    const {interface: branding} = readJson(path.join(plugin, ".codex-plugin/plugin.json"));
    for (const field of ["composerIcon", "logo", "logoDark"]) {
      assert.deepEqual(fs.readFileSync(path.join(plugin, branding[field])), fs.readFileSync(path.join(root, branding[field])));
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
    const resource = "skills/design-harness-init/assets/样例 图片.bin";
    const bytes = Buffer.from([0, 1, 128, 254, 255, 0, 13, 10]);
    fs.writeFileSync(path.join(root, resource), bytes);
    fs.appendFileSync(path.join(root, "skills/design-harness-init/SKILL.md"),
      "\n[样例](<assets/" + encodeURIComponent("样例 图片.bin") + ">)\n");
    assert.deepEqual(validate(root), []);
    const result = packagePlugin(path.join(base, "out"), root);
    const files = unzipSync(fs.readFileSync(result.archive));
    assert.deepEqual(Buffer.from(files["design-harness/plugins/design-harness/" + resource]), bytes);
  });

  test("Working data, dependencies and generated files are excluded", () => {
    const marker = Buffer.from("private-fixture-" + path.basename(base));
    for (const relative of ["dist/old.zip", ".design-harness/private.txt", "node_modules/unused/README.md",
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
    for (const relative of ["skills/design-harness-init/third-party/harness-designing-plugin/LICENSE",
      "skills/design-harness-design/third-party/impeccable/LICENSE", "skills/design-harness-design/third-party/impeccable/NOTICE.md",
      ...SKILL_NAMES.flatMap(name => ["LICENSE", "NOTICE.md"].map(file => `skills/${name}/third-party/design-md/${file}`))]) {
      const filename = path.join(root, relative);
      const original = fs.readFileSync(filename);
      fs.writeFileSync(filename, "");
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /Empty skill resource/);
      fs.writeFileSync(filename, original);
    }
  });

  test("Missing skills or workflow assets prevent packaging", () => {
    for (const relative of ["skills/design-harness-init/SKILL.md", "skills/design-harness-init/assets/harness-entry.txt",
      "skills/design-harness-init/references/figma-console.md", "skills/design-harness-design/references/figma-use.md",
      ...SKILL_NAMES.flatMap(name => ["references/design-description.md", "assets/design-description.txt"].map(file => `skills/${name}/${file}`))]) {
      const filename = path.join(root, relative);
      const original = fs.readFileSync(filename);
      fs.unlinkSync(filename);
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /invalid plugin/);
      fs.writeFileSync(filename, original);
    }
  });

  test("Each skill works when copied without the plugin or sibling skill", () => {
    const code = `import fs from 'node:fs';
      import vm from 'node:vm';
      const read = vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8') + '\\nreadDesignHarness;');
      read({root: {children: [{id: '1:1', type: 'PAGE', name: 'design-harness'}]}}, {action: 'pages'})
        .then(result => process.stdout.write(JSON.stringify(result)));`;
    for (const name of SKILL_NAMES) {
      const isolated = path.join(base, "isolated " + name, name);
      fs.cpSync(path.join(root, "skills", name), isolated, {recursive: true});
      assert.deepEqual(validateSkill(isolated), []);
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", code, path.join(isolated, "scripts/figma-reader.js")],
        {cwd: isolated, encoding: "utf8"});
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout).candidates, ["1:1"]);
    }
  });

  test("A skill cannot reference an existing plugin root document", () => {
    const skill = path.join(root, "skills/design-harness-init");
    fs.appendFileSync(path.join(skill, "SKILL.md"), "\n[external dependency](../../docs/validation.md)\n");
    assert.ok(validateSkill(skill).some(error => error.includes("escapes skill")));
  });

  test("A skill cannot reference a sibling skill", () => {
    const skill = path.join(root, "skills/design-harness-init");
    fs.appendFileSync(path.join(skill, "SKILL.md"), "\n[sibling dependency](../design-harness-design/references/interview.md)\n");
    assert.ok(validateSkill(skill).some(error => error.includes("escapes skill")));
  });

  test("Unreachable skill references are detected", () => {
    const skill = path.join(root, "skills/design-harness-init");
    fs.writeFileSync(path.join(skill, "references/unused.md"), "Important guidance with no loading path.\n");
    assert.ok(validateSkill(skill).some(error => error.includes("Unreachable skill reference")));
  });

  test("Diverging shared resources are detected", () => {
    for (const relative of ["scripts/figma-reader.js", "assets/resource-card.txt",
      "references/work-templates.md", "assets/figma-work-templates.json",
      "references/design-description.md", "assets/design-description.txt",
      "third-party/design-md/LICENSE", "third-party/design-md/NOTICE.md", "LICENSE"]) {
      const filename = path.join(root, "skills/design-harness-design", relative);
      const original = fs.readFileSync(filename);
      fs.appendFileSync(filename, "\n");
      assert.ok(validate(root).some(error => error.includes("Shared skill resource differs")));
      fs.writeFileSync(filename, original);
    }
  });

  test("Document typography references and reading dimensions must be usable", () => {
    const skill = path.join(root, "skills/design-harness-init");
    const filename = path.join(skill, "assets/figma-work-templates.json");
    const original = fs.readFileSync(filename);
    for (const mutate of [
      kit => delete kit.documentPresentation,
      kit => kit.documentPresentation.blocks.push({...kit.documentPresentation.blocks[0]}),
      kit => kit.documentPresentation.blocks[0].typography = "missing-style",
      kit => kit.defaults.typography.body = 0,
      kit => kit.defaults.reading.textColumnWidth = -1,
      kit => kit.defaults.reading.lineHeightPercent = "150",
      kit => delete kit.defaults.reading.paragraphSpacing
    ]) {
      const kit = JSON.parse(original);
      mutate(kit);
      fs.writeFileSync(filename, JSON.stringify(kit));
      assert.ok(validateSkill(skill).some(error => error.includes("work template")));
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /work template/);
    }
    const adjusted = JSON.parse(original);
    adjusted.defaults.typography.body = 20;
    adjusted.defaults.reading = {textColumnWidth: 640, lineHeightPercent: 160, paragraphSpacing: 0, listIndent: 0};
    fs.writeFileSync(filename, JSON.stringify(adjusted));
    assert.deepEqual(validateSkill(skill), []);
    fs.writeFileSync(filename, original);
  });

  test("Broken work template dependencies and slots prevent distribution", () => {
    const skill = path.join(root, "skills/design-harness-init");
    const filename = path.join(skill, "assets/figma-work-templates.json");
    const original = fs.readFileSync(filename);
    for (const mutate of [
      kit => kit.templates[0].uses.push("missing/primitive"),
      kit => kit.templates[0].optionalSlots.push(kit.templates[0].requiredSlots[0]),
      kit => kit.primitives.push({...kit.primitives[0]})
    ]) {
      const kit = JSON.parse(original);
      mutate(kit);
      fs.writeFileSync(filename, JSON.stringify(kit));
      assert.ok(validateSkill(skill).some(error => error.includes("work template")));
      assert.throws(() => packagePlugin(path.join(base, "out"), root), /work template/);
    }
    fs.writeFileSync(filename, "{broken");
    assert.ok(validateSkill(skill).some(error => error.includes("Invalid work template JSON")));
    fs.writeFileSync(filename, original);
  });
});
