import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
export const readJson = file => JSON.parse(fs.readFileSync(file,"utf8"));
export const hash = data => createHash("sha256").update(data).digest("hex");
export const inside = (base,file) => file===base || file.startsWith(base+path.sep);
export function resolveFile(base,relative) {
  assert(typeof relative==="string" && relative && !path.isAbsolute(relative) && !relative.includes("\\") && !relative.split("/").some(part=>["..","node_modules",".cache",".git"].includes(part)),"非法相对路径: "+relative);
  const root=fs.realpathSync(base),file=path.resolve(root,relative);
  assert(inside(root,file) && fs.existsSync(file),"资源不存在: "+relative);
  const real=fs.realpathSync(file);
  assert(real===file && inside(root,real) && fs.statSync(real).isFile(),"资源越界、软链接或不是文件: "+relative);
  return real;
}
export function filesIn(base,{exclude=[]}={}) {
  const result=[];
  function walk(dir) {
    for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,"en"))) {
      if(["node_modules",".cache",".git"].includes(item.name)||dir===base&&exclude.includes(item.name))continue;
      const file=path.join(dir,item.name);assert(!item.isSymbolicLink(),"不允许软链接资源: "+file);
      if(item.isDirectory())walk(file);else if(item.isFile())result.push(file);
    }
  }
  walk(base);return result;
}
export const resourceFiles = folder => filesIn(folder,{exclude:["foundation","evidence","verification","reviews","explorations"]}).filter(file=>!/\.(log|tmp)$/.test(file));

export const canonicalDirectory = directory => fs.realpathSync(directory);
export const fileHash = file => hash(fs.readFileSync(file));
