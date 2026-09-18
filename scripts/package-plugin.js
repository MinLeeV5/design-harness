#!/usr/bin/env node
// 生成本地 marketplace 分发包，不发布或安装插件。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {parseArgs} from "node:util";
import {fileURLToPath} from "node:url";
import {zipSync} from "fflate";
import {ROOT, validate} from "./validate.js";
import {isWithin, walk} from "./files.js";

const FILES = new Set(["README.md", "LICENSE", "AGENTS.md", "package.json", "package-lock.json", ".nvmrc",
  ".agents/plugins/marketplace.json"]);
const DIRECTORIES = new Set([".codex-plugin", "skills", "scripts", "docs", "tests"]);
const IGNORED = new Set([".git", ".design-harness", "dist", "node_modules", "coverage", ".nyc_output", ".DS_Store"]);

export function packagePlugin(destination, directory = ROOT) {
  const root = fs.realpathSync(directory);
  const errors = validate(root);
  if (errors.length) throw new Error("Cannot package invalid plugin: " + errors.join("; "));
  const {name: folder, version} = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin/plugin.json"), "utf8"));
  const out = path.resolve(destination === "~" ? os.homedir() : destination.replace(/^~[/\\]/, os.homedir() + path.sep));
  const archive = path.join(out, folder + ".zip");
  const checksum = archive + ".sha256";
  if (fs.existsSync(archive) || fs.existsSync(checksum)) {
    throw new Error("Package already exists; use a fresh output directory");
  }
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents/plugins/marketplace.json"), "utf8"));
  marketplace.plugins[0].source.path = "./plugins/" + folder;
  const content = new Map([[folder + "/.agents/plugins/marketplace.json",
    Buffer.from(JSON.stringify(marketplace, null, 2) + "\n")]]);
  for (const filename of walk(root, (filename, entry) => {
    if (IGNORED.has(entry.name)) return true;
    const relative = path.relative(root, filename).split(path.sep).join("/");
    return !FILES.has(relative) && !DIRECTORIES.has(relative.split("/")[0]) &&
      ![...FILES].some(file => file.startsWith(relative + "/"));
  })) {
    const relative = path.relative(root, filename);
    if (fs.lstatSync(filename).isSymbolicLink() || !isWithin(root, fs.realpathSync(filename))) {
      throw new Error("Do not package symlinked or external files: " + relative);
    }
    if (!fs.statSync(filename).isFile()) continue;
    content.set(folder + "/plugins/" + folder + "/" + relative.split(path.sep).join("/"), fs.readFileSync(filename));
  }

  // ZIP 使用本地日历字段编码时间；固定这些字段，避免源文件时间和时区影响产物。
  const entries = Object.fromEntries([...content].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const data = zipSync(entries, {level: 6, mtime: new Date(2026, 0, 1), os: 3, attrs: (0o100644 << 16) >>> 0});
  const digest = createHash("sha256").update(data).digest("hex");
  fs.mkdirSync(out, {recursive: true});
  const created = [];
  try {
    for (const [filename, bytes] of [[archive, data], [checksum, digest + "  " + path.basename(archive) + "\n"]]) {
      const descriptor = fs.openSync(filename, "wx");
      created.push(filename);
      try { fs.writeFileSync(descriptor, bytes); }
      finally { fs.closeSync(descriptor); }
    }
  } catch (error) {
    for (const filename of created) fs.rmSync(filename, {force: true});
    if (error.code === "EEXIST") throw new Error("Package already exists; use a fresh output directory");
    throw error;
  }
  return {archive, version, sha256: digest, files: content.size, marketplace: marketplace.name};
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const {values} = parseArgs({options: {out: {type: "string", default: "dist"}, help: {type: "boolean", short: "h"}}});
    if (values.help) console.log("Usage: node scripts/package-plugin.js [--out dist/build]");
    else console.log(JSON.stringify(packagePlugin(values.out), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
