import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

export const TOOL = path.resolve(import.meta.dirname, "../..");
export const PLUGIN = path.dirname(TOOL);
export const requireTool = createRequire(path.join(PLUGIN, "package.json"));
export const frontendFile = () => path.join(TOOL, "src/frontend/index.tsx");
export const previewFile = () => path.join(TOOL, "src/preview/runtime.tsx");
export const sdkFile = () => path.join(TOOL, "src/preview/sdk.tsx");

// Resolve from the installed tool, including npm hoisting and pnpm real paths.
export function packageDirectory(name, from=PLUGIN) {
  const resolve=createRequire(path.join(from,"package.json")).resolve;
  let entry;
  try { entry=resolve(name+"/package.json"); }
  catch(error) {
    if(!["ERR_PACKAGE_PATH_NOT_EXPORTED","MODULE_NOT_FOUND"].includes(error.code))throw error;
    entry=resolve(name);
  }
  let directory=path.dirname(fs.realpathSync(entry));
  for(;;) {
    const manifest=path.join(directory,"package.json");
    if(fs.existsSync(manifest)&&JSON.parse(fs.readFileSync(manifest,"utf8")).name===name)return directory;
    const parent=path.dirname(directory);
    if(parent===directory)throw new Error("找不到工具依赖包信息: "+name);
    directory=parent;
  }
}

let dependencyRoots;
export function toolDependencyRoots() {
  if(dependencyRoots)return dependencyRoots;
  const roots=new Set();
  function visit(directory) {
    const manifest=JSON.parse(fs.readFileSync(path.join(directory,"package.json"),"utf8"));
    const optional={...manifest.peerDependencies,...manifest.optionalDependencies};
    for(const name of new Set([...Object.keys(manifest.dependencies??{}),...Object.keys(optional)])) {
      let dependency;
      try { dependency=packageDirectory(name,directory); }
      catch(error) { if(Object.hasOwn(optional,name)&&!Object.hasOwn(manifest.dependencies??{},name))continue;throw error; }
      if(!roots.has(dependency)){roots.add(dependency);visit(dependency);}
    }
  }
  visit(PLUGIN);
  dependencyRoots=Object.freeze([...roots]);
  return dependencyRoots;
}
