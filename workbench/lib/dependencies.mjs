import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {assert,readJson,resolveFile,hash} from "./protocol.mjs";
export const reserved = name => ["react","react-dom","scheduler","zod","esbuild","marked","yaml","typescript"].includes(name)||name.startsWith("@json-render/")||name.startsWith("@design-harness/");
function declaration(workspace) {
  if(!fs.existsSync(path.join(workspace,"package.json")))return null;
  const source=readJson(resolveFile(workspace,"package.json"));
  assert(source.dependencies&&typeof source.dependencies==="object"&&!Array.isArray(source.dependencies),"业务 package.json 需要 dependencies 对象");
  assert(!source.scripts&&!source.devDependencies,"业务资源只声明 dependencies，不承载工具脚本或开发依赖");
  const dependencies=Object.fromEntries(Object.entries(source.dependencies).sort(([a],[b])=>a.localeCompare(b)));
  for(const [name,version] of Object.entries(dependencies))assert(/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name)&&!reserved(name)&&typeof version==="string"&&/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version),"扩展依赖需固定 npm 版本，不能覆盖工具依赖: "+name);
  return {name:"design-harness-business",version:"0.0.0",private:true,type:"module",dependencies};
}
const cacheRoot=()=>path.join(process.env.XDG_CACHE_HOME||path.join(os.homedir(),".cache"),"design-harness","business");
export function dependencyDirectory(workspace) {
  const manifest=declaration(workspace);if(!manifest||!Object.keys(manifest.dependencies).length)return null;
  const lock=readJson(resolveFile(workspace,"dependencies.lock.json"));
  assert(JSON.stringify(lock.packages?.[""]?.dependencies)===JSON.stringify(manifest.dependencies),"扩展依赖锁与声明不一致，请运行 deps");
  const key=hash(JSON.stringify(manifest)+JSON.stringify(lock)),directory=path.join(cacheRoot(),key);
  assert(fs.existsSync(path.join(directory,".ready")),"扩展依赖尚未安装，请从插件运行 deps --project <项目>");
  return directory;
}
export function installDependencies(workspace,{frozen=false}={}) {
  const manifest=declaration(workspace);if(!manifest||!Object.keys(manifest.dependencies).length)return {dependencies:0};
  fs.mkdirSync(cacheRoot(),{recursive:true});const temp=fs.mkdtempSync(path.join(cacheRoot(),"install-"));
  try {
    fs.writeFileSync(path.join(temp,"package.json"),JSON.stringify(manifest,null,2)+"\n");
    const locked=fs.existsSync(path.join(workspace,"dependencies.lock.json"));
    if(locked)fs.copyFileSync(resolveFile(workspace,"dependencies.lock.json"),path.join(temp,"package-lock.json"));
    const matches=locked&&JSON.stringify(readJson(path.join(temp,"package-lock.json")).packages?.[""]?.dependencies)===JSON.stringify(manifest.dependencies);
    assert(!frozen||matches,"重建需要与扩展依赖声明匹配的固定锁文件");
    const run=args=>{const r=spawnSync("npm",args,{cwd:temp,encoding:"utf8"});assert(r.status===0,"扩展依赖安装失败: "+(r.stderr||r.stdout));};
    if(!matches)run(["install","--package-lock-only","--ignore-scripts","--no-audit","--no-fund"]);
    run(["ci","--ignore-scripts","--no-audit","--no-fund"]);
    const lock=readJson(path.join(temp,"package-lock.json")),key=hash(JSON.stringify(manifest)+JSON.stringify(lock)),directory=path.join(cacheRoot(),key);
    assert(JSON.stringify(declaration(workspace))===JSON.stringify(manifest),"安装期间依赖声明已变化，请重新运行 deps");
    if(!matches){const target=path.join(workspace,"dependencies.lock.json"),pending=target+"."+path.basename(temp)+".tmp";try{fs.copyFileSync(path.join(temp,"package-lock.json"),pending,fs.constants.COPYFILE_EXCL);fs.renameSync(pending,target);}finally{fs.rmSync(pending,{force:true});}}
    fs.writeFileSync(path.join(temp,".ready"),key);
    if(!fs.existsSync(directory))fs.renameSync(temp,directory);
    return {dependencies:Object.keys(manifest.dependencies).length,cache:directory};
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
