import fs from "node:fs";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
import {inside} from "./filesystem.mjs";

export function resolveExportFile(workspace,output) {
  assert(typeof output==="string"&&output,"请用 --out 指定资源目录之外的 HTML 文件");
  const requested=path.resolve(output);
  assert(path.extname(requested).toLowerCase()===".html","导出文件需要 .html 扩展名");
  const file=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
  assert(!inside(fs.realpathSync(workspace),file),"请将 HTML 导出到 design-harness 资源目录之外");
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});
  assert(!stat||stat.isFile()&&!stat.isSymbolicLink(),"导出目标必须是普通文件，不能是目录或软链接");
  return file;
}

export function writeExportFile(file,html) {
  const pending=file+"."+randomBytes(8).toString("hex")+".tmp";
  try { fs.writeFileSync(pending,html,{flag:"wx"}); fs.renameSync(pending,file); }
  finally { fs.rmSync(pending,{force:true}); }
}
