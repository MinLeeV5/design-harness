import fs from "node:fs";
import path from "node:path";

export function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

export function isFile(filename) {
  try {
    return fs.statSync(filename).isFile();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
    throw error;
  }
}

// 不跟随目录软链接；由调用方决定哪些目录需要跳过或拒绝分发。
export function* walk(directory, skip = () => false) {
  const entries = fs.readdirSync(directory, {withFileTypes: true})
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (skip(filename, entry)) continue;
    yield filename;
    if (entry.isDirectory()) yield* walk(filename, skip);
  }
}
