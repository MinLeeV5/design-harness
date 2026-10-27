#!/usr/bin/env node
// 离线检查插件分发结构、Skill 独立性及本地引用。
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isWithin, isFile, walk} from "./files.js";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const SKILL_NAMES = ["design-harness-init", "design-harness-interaction", "design-harness-visual", "design-harness-writeback"];
// Each entry carries instructions, a launcher and business-only templates; the plugin owns one runtime.
export const WORKSPACE_FILES = [".gitignore","README.md","project.json","foundation/components.tsx","foundation/catalog.ts","foundation/registry.tsx","foundation/design.md","foundation/foundation.json","foundation/tokens.css"];
export const WORKBENCH_FILES = ["app.tsx","interaction-reader.tsx","conditions.mjs","conditions.d.mts","live-agent.tsx","agent-controls.mjs","agent-controls.d.mts","inspector.ts","preview.tsx","sdk.tsx","types.ts","assets.d.ts","assets/harness-icon.png","studio.css","cli.mjs",...["paths","protocol","dependencies","typecheck","build","server","workspace","live-agent","agent-events","validate-preview","markdown","interaction-docs"].map(n=>"lib/"+n+".mjs"),"vendor/impeccable/live-browser-dom.js","vendor/impeccable/LICENSE","vendor/impeccable/NOTICE.md","starter/manifest.json","starter/scenarios.json","starter/interactions/task.md","starter/requirement.md","starter/handoff.md",...["comfortable","compact"].flatMap(c=>["catalog.ts","registry.tsx","params.json","pages/task.json","components/Task.tsx","components/task.css"].map(f=>"starter/candidates/"+c+"/"+f))];
export const SHARED_SKILL_GROUPS = [{
  skills:SKILL_NAMES,
  files:["scripts/harness.mjs","references/fidelity.md","references/workspace.md","references/protocol.md","references/interactions.md","references/preview-export.md","references/handoff.md",
    ...WORKSPACE_FILES.map(file=>"assets/workspace/"+file)]
}];
export function requiredSkillFiles(name) {
  const licenses=["LICENSE"];
  if(["design-harness-init","design-harness-visual"].includes(name))
    licenses.push("references/assets.md","third-party/lucide/LICENSE","third-party/visual-assets/NOTICE.md","third-party/design-md/LICENSE","third-party/design-md/NOTICE.md");
  if(["design-harness-interaction","design-harness-visual"].includes(name))
    licenses.push("third-party/impeccable/LICENSE","third-party/impeccable/NOTICE.md","third-party/ui-ux-pro-max/LICENSE","third-party/ui-ux-pro-max/NOTICE.md");
  if(name==="design-harness-init")licenses.push("third-party/harness-designing-plugin/LICENSE");
  return ["SKILL.md","agents/openai.yaml","references/workflow.md","references/evaluation.md","references/sources.md",
    ...licenses,...SHARED_SKILL_GROUPS[0].files];
}
const PNG_SIGNATURE=Buffer.from("89504e470d0a1a0a","hex");
function validateWorkspaceTemplate(directory) {
  try {
    const project=JSON.parse(fs.readFileSync(path.join(directory,"project.json"),"utf8"));
    if(project.schemaVersion!==1||project.renderer!=="json-render/react")return ["Invalid business resource template protocol"];
    if(["studio","workbench","package-lock.json","tsconfig.json"].some(name=>fs.existsSync(path.join(directory,name))))return ["Business resource template must not contain workbench code or tool configuration"];
    return [];
  }catch(error){return ["Invalid business resource template: "+error.message];}
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

  const required = requiredSkillFiles(name);
  for (const relative of required) {
    const filename = path.join(skill, relative);
    if (!isFile(filename)) errors.push(`Missing skill resource: ${name}/${relative}`);
    else if (!fs.statSync(filename).size) errors.push(`Empty skill resource: ${name}/${relative}`);
  }
  if (errors.length) return errors;

  errors.push(...validateWorkspaceTemplate(path.join(skill, "assets/workspace")));
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
  const metadataText = fs.readFileSync(metadata, "utf8");
  if (!metadataText.includes("$" + name)) errors.push(`Prompt must invoke skill: ${metadata}`);
  if (!/^policy:\s*\n  allow_implicit_invocation: false\s*$/m.test(metadataText)) {
    errors.push(`Stage must require explicit invocation: ${metadata}`);
  }

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

  for(const relative of WORKBENCH_FILES)check(isFile(path.join(root,"workbench",relative)),"Missing fixed workbench resource: "+relative);
  check(packageManifest.dependencies?.["@json-render/core"]&&packageManifest.dependencies?.["@json-render/react"],"Fixed workbench requires json-render runtime dependencies");
  const skillRoot = path.join(root, "skills");
  const skills = fs.existsSync(skillRoot) ? fs.readdirSync(skillRoot)
    .map(name => path.join(skillRoot, name)).filter(skill => isFile(path.join(skill, "SKILL.md"))) : [];
  check(skills.length === SKILL_NAMES.length && skills.every(skill => SKILL_NAMES.includes(path.basename(skill))),
    "Expected exactly Init, Interaction, Visual and Writeback public skills");
  for (const skill of skills) errors.push(...validateSkill(skill));

  for (const {skills: consumers, files} of SHARED_SKILL_GROUPS) {
    for (const relative of files) {
      const copies = consumers.map(name => path.join(skillRoot, name, relative));
      check(copies.every(isFile) && copies.slice(1).every(copy => fs.readFileSync(copies[0]).equals(fs.readFileSync(copy))),
        `Shared skill resource differs: ${relative} (${consumers.join(", ")})`);
    }
  }
  for (const skill of skills) {
    const license = path.join(skill, "LICENSE");
    check(isFile(license) && fs.readFileSync(license).equals(fs.readFileSync(path.join(root, "LICENSE"))),
      `Skill license must match the original license: ${path.basename(skill)}`);
  }

  // DevKeel 与 OpenSpec 是仓库开发资产；模板中的待生成引用不属于插件文档链接。
  const ignored = new Set([".git", "dist", ".design-harness", "design-harness", "skills", "node_modules", "coverage", ".nyc_output"]);
  const development = new Set([".harness", "openspec"]);
  for (const filename of walk(root, (filename, entry) => ignored.has(entry.name) ||
    (path.dirname(filename) === root && development.has(entry.name)))) {
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
