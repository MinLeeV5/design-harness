#!/usr/bin/env node
// 离线检查插件分发结构、Skill 独立性及本地引用。
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isWithin, isFile, walk} from "./files.js";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const SKILL_NAMES = ["design-harness-init", "design-harness-design"];
const SHARED_SKILL_FILES = ["scripts/figma-reader.js", "assets/resource-card.txt",
  "references/visual-assets.md", "assets/library-sources.txt",
  "references/work-templates.md", "assets/figma-work-templates.json",
  "references/design-description.md", "assets/design-description.txt",
  "third-party/design-md/LICENSE", "third-party/design-md/NOTICE.md", "LICENSE"];
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function validateWorkTemplates(filename) {
  const errors = [];
  let kit;
  try { kit = JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) { return [`Invalid work template JSON: ${error.message}`]; }
  if (kit.schemaVersion !== 1 || kit.artifactKind !== "native-figma-construction-blueprint" ||
    typeof kit.version !== "string" || !Array.isArray(kit.primitives) || !Array.isArray(kit.templates)) {
    return ["Invalid work template catalog structure"];
  }
  const blocks = kit.documentPresentation?.blocks;
  const typography = kit.defaults?.typography;
  if (!Array.isArray(blocks) || !blocks.length || !typography || typeof typography !== "object") {
    errors.push("Missing work template document presentation");
  } else {
    const roles = new Set();
    for (const block of blocks) {
      if (!block || typeof block.role !== "string" || !block.role || roles.has(block.role)) {
        errors.push("Missing or duplicate work template document role");
        continue;
      }
      roles.add(block.role);
      if (!Object.hasOwn(typography, block.typography) || !Number.isFinite(typography[block.typography]) ||
        typography[block.typography] <= 0) {
        errors.push(`Unresolved or invalid work template typography: ${block.role}`);
      }
    }
  }
  const reading = kit.defaults?.reading;
  for (const [field, allowZero] of [["textColumnWidth", false], ["lineHeightPercent", false],
    ["paragraphSpacing", true], ["listIndent", true]]) {
    const value = reading?.[field];
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      errors.push(`Invalid work template reading layout: ${field}`);
    }
  }
  const ids = new Set();
  const primitives = new Set(kit.primitives.map(item => item.id));
  for (const item of [...kit.primitives, ...kit.templates]) {
    if (typeof item.id !== "string" || !item.id || ids.has(item.id)) {
      errors.push("Missing or duplicate work template asset ID");
    }
    ids.add(item.id);
    if (!["FRAME", "COMPONENT", "COMPONENT_SET"].includes(item.nativeType)) {
      errors.push(`Invalid native type in work template: ${item.id}`);
    }
  }
  for (const template of kit.templates) {
    if (!Array.isArray(template.uses) || template.uses.some(id => !primitives.has(id))) {
      errors.push(`Unresolved work template primitive: ${template.id}`);
    }
    const required = template.requiredSlots;
    const optional = template.optionalSlots;
    if (!Array.isArray(required) || !required.length || !Array.isArray(optional)) {
      errors.push(`Missing work template slots: ${template.id}`);
    } else {
      const slots = [...required, ...optional];
      if (slots.some(slot => typeof slot !== "string" || !slot) || new Set(slots).size !== slots.length) {
        errors.push(`Invalid or conflicting work template slots: ${template.id}`);
      }
    }
  }
  return errors;
}

function validateBranding(root, manifest) {
  const errors = [];
  for (const [field, value] of [["homepage", manifest.homepage], ["websiteURL", manifest.interface?.websiteURL]]) {
    try {
      if (new URL(value).protocol !== "https:") throw new Error("Expected HTTPS");
    } catch { errors.push(`Invalid branding URL: ${field}`); }
  }
  if (!/^#[\da-f]{6}$/i.test(manifest.interface?.brandColor || "")) errors.push("Invalid brandColor");
  for (const field of ["composerIcon", "logo", "logoDark"]) {
    const relative = manifest.interface?.[field];
    if (typeof relative !== "string" || !relative.startsWith("./assets/") || !relative.endsWith(".png") ||
      relative.includes("\\") || relative.split("/").includes("..")) {
      errors.push(`Invalid interface asset path: ${field}`);
      continue;
    }
    const filename = path.resolve(root, relative);
    if (!isFile(filename) || fs.realpathSync(filename) !== filename) {
      errors.push(`Missing or symlinked interface asset: ${field}`);
      continue;
    }
    const data = fs.readFileSync(filename);
    if (data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE) ||
      data.toString("ascii", 12, 16) !== "IHDR" || !data.readUInt32BE(16) || !data.readUInt32BE(20)) {
      errors.push(`Invalid PNG interface asset: ${field}`);
    }
  }
  return errors;
}

function* localLinks(filename) {
  const content = fs.readFileSync(filename, "utf8");
  for (const [, link] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link) || link.startsWith("#")) continue;
    const relative = decodeURIComponent(link.split("#", 1)[0].replace(/^<|>$/g, ""));
    if (!relative) continue;
    const target = path.resolve(path.dirname(filename), relative);
    yield [link, fs.existsSync(target) ? fs.realpathSync(target) : target];
  }
}

export function validateSkill(directory) {
  const skill = fs.realpathSync(directory);
  const name = path.basename(skill);
  const errors = [];
  if (!SKILL_NAMES.includes(name)) return [`Unexpected skill name: ${name}`];

  const required = ["SKILL.md", "agents/openai.yaml", "LICENSE", "scripts/figma-reader.js",
    "references/workflow.md", "references/figma-operations.md", "references/figma-console.md",
    "references/figma-use.md", "references/evaluation.md", "references/sources.md", "assets/resource-card.txt",
    "references/visual-assets.md", "assets/library-sources.txt",
    "references/work-templates.md", "assets/figma-work-templates.json",
    "references/design-description.md", "assets/design-description.txt",
    "third-party/design-md/LICENSE", "third-party/design-md/NOTICE.md"];
  if (name === "design-harness-init") {
    required.push("references/context-contract.md", "references/modules.md", "references/asset-state.md",
      "assets/harness-entry.txt", "assets/module-overview.txt", "third-party/harness-designing-plugin/LICENSE");
  } else {
    required.push("references/context-loading.md", "references/interview.md", "references/knowledge-update.md",
      "references/impeccable.md", "assets/requirement-page.txt", "assets/writeback-delta.txt",
      "references/prototyping.md", "assets/interaction-prototype.txt", "references/ui-ux-pro-max.md",
      "third-party/ui-ux-pro-max/LICENSE", "third-party/ui-ux-pro-max/NOTICE.md",
      "third-party/impeccable/LICENSE", "third-party/impeccable/NOTICE.md");
  }
  for (const relative of required) {
    const filename = path.join(skill, relative);
    if (!isFile(filename)) errors.push(`Missing skill resource: ${name}/${relative}`);
    else if (!fs.statSync(filename).size) errors.push(`Empty skill resource: ${name}/${relative}`);
  }
  if (errors.length) return errors;

  errors.push(...validateWorkTemplates(path.join(skill, "assets/figma-work-templates.json")));
  const files = [...walk(skill)];
  for (const filename of files) {
    if (fs.lstatSync(filename).isSymbolicLink()) {
      errors.push(`Do not distribute symlinked skill resources: ${path.relative(skill, filename)}`);
    }
  }
  if (errors.length) return errors;

  const entry = path.join(skill, "SKILL.md");
  const content = fs.readFileSync(entry, "utf8").replace(/\r\n/g, "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!front) errors.push(`Missing frontmatter: ${entry}`);
  else {
    if (!(front[1] + "\n").includes(`name: ${name}\n`)) errors.push(`Skill name mismatch: ${entry}`);
    if (!/^description: .+/m.test(front[1])) errors.push(`Missing trigger description: ${entry}`);
  }
  if (content.replace(/\n$/, "").split("\n").length >= 200) errors.push(`Skill entrypoint too long: ${entry}`);
  const metadata = path.join(skill, "agents/openai.yaml");
  if (!fs.readFileSync(metadata, "utf8").includes("$" + name)) errors.push(`Prompt must invoke skill: ${metadata}`);

  const adjacency = new Map();
  for (const filename of files) {
    if (!isFile(filename) || path.extname(filename) !== ".md") continue;
    const targets = [];
    adjacency.set(filename, targets);
    for (const [link, target] of localLinks(filename)) {
      if (!isWithin(skill, target)) {
        errors.push(`Reference escapes skill ${name}: ${path.relative(skill, filename)} -> ${link}`);
      } else if (!fs.existsSync(target)) {
        errors.push(`Broken/nonportable link in ${name}/${path.relative(skill, filename)}: ${link}`);
      } else if (isFile(target) && path.extname(target) === ".md") targets.push(target);
    }
  }

  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const filename = pending.pop();
    if (visited.has(filename)) continue;
    visited.add(filename);
    pending.push(...(adjacency.get(filename) || []));
  }
  for (const filename of walk(path.join(skill, "references"))) {
    if (isFile(filename) && path.extname(filename) === ".md" && !visited.has(filename)) {
      errors.push(`Unreachable skill reference: ${name}/${path.relative(skill, filename)}`);
    }
  }
  return errors;
}

export function validate(directory = ROOT) {
  const root = fs.realpathSync(directory);
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin/plugin.json"), "utf8"));
  const sourceLayout = manifest.name === path.basename(root);
  const cacheLayout = path.basename(path.dirname(root)) === manifest.name && path.basename(root) === manifest.version;
  check(sourceLayout || cacheLayout, "Expected source plugin folder or Codex versioned cache layout");
  check(manifest.skills === "./skills/", "Skills must be declared");
  check(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(manifest.version || ""), "Invalid version");
  for (const field of ["description", "author", "interface"]) check(Boolean(manifest[field]), `Missing manifest ${field}`);
  const prompts = manifest.interface?.defaultPrompt;
  check(Array.isArray(prompts) && prompts.length >= 1 && prompts.length <= 3 &&
    prompts.every(prompt => typeof prompt === "string" && [...prompt].length <= 128), "Invalid defaultPrompt");
  check(!["hooks", "mcpServers", "apps"].some(key => key in manifest), "This plugin distributes skills only");
  errors.push(...validateBranding(root, manifest));

  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents/plugins/marketplace.json"), "utf8"));
  check(marketplace.name === manifest.name, "Marketplace must use the plugin's stable name");
  const entry = marketplace.plugins?.[0];
  check(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1 && entry?.name === manifest.name &&
    entry.source?.source === "local" && entry.source?.path === "./", "Marketplace must resolve this root plugin");
  check(entry?.policy?.installation === "AVAILABLE" && entry?.policy?.authentication === "ON_INSTALL" &&
    entry?.category === "Productivity", "Invalid marketplace policy or category");
  const packageManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  check(packageManifest.version === manifest.version?.split("+")[0] && packageLock.version === packageManifest.version &&
    packageLock.packages?.[""]?.version === packageManifest.version, "Plugin and npm package versions must agree");

  const skillRoot = path.join(root, "skills");
  const skills = fs.existsSync(skillRoot) ? fs.readdirSync(skillRoot)
    .map(name => path.join(skillRoot, name)).filter(skill => isFile(path.join(skill, "SKILL.md"))) : [];
  check(skills.length === SKILL_NAMES.length && skills.every(skill => SKILL_NAMES.includes(path.basename(skill))),
    "Expected only Init and Design public skills");
  for (const skill of skills) errors.push(...validateSkill(skill));

  for (const relative of SHARED_SKILL_FILES) {
    const copies = SKILL_NAMES.map(name => path.join(skillRoot, name, relative));
    check(copies.every(isFile) && fs.readFileSync(copies[0]).equals(fs.readFileSync(copies[1])),
      `Shared skill resource differs: ${relative}`);
  }
  for (const skill of skills) {
    const license = path.join(skill, "LICENSE");
    check(isFile(license) && fs.readFileSync(license).equals(fs.readFileSync(path.join(root, "LICENSE"))),
      `Skill license must match the original license: ${path.basename(skill)}`);
  }

  const ignored = new Set([".git", "dist", ".design-harness", "skills", "node_modules", "coverage", ".nyc_output"]);
  for (const filename of walk(root, (_, entry) => ignored.has(entry.name))) {
    if (!isFile(filename) || path.extname(filename) !== ".md") continue;
    for (const [link, target] of localLinks(filename)) {
      check(isWithin(root, target) && fs.existsSync(target),
        `Broken/nonportable link in ${path.relative(root, filename)}: ${link}`);
    }
  }
  for (const obsolete of ["workflows", "references", "evaluation", "templates", "third-party", "scripts/figma-reader.js"]) {
    check(!fs.existsSync(path.join(root, obsolete)), `Runtime resources must be inside skills: ${obsolete}`);
  }
  return errors;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let errors;
  try { errors = validate(); }
  catch (error) { errors = [error.message]; }
  if (errors.length) {
    console.error("Validation failed:\n" + errors.map(error => "- " + error).join("\n"));
    process.exitCode = 1;
  } else console.log("Self-contained skills, reachable references, synchronized resources and upstream notices validated.");
}
