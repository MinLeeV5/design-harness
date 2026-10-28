import fs from "node:fs";
import {randomBytes} from "node:crypto";
import {assert} from "../../contracts/assertions.mjs";
import {hash} from "./filesystem.mjs";

export function writeSpec(file, spec, expectedHash) {
  const bytes = JSON.stringify(spec,null,2)+"\n";
  const pending = file+"."+randomBytes(6).toString("hex")+".tmp";
  try {
    fs.writeFileSync(pending,bytes,{flag:"wx"});
    assert(hash(fs.readFileSync(file))===expectedHash,"保存前源文件已变化");
    fs.renameSync(pending,file);
  } finally {
    fs.rmSync(pending,{force:true});
  }
  return hash(bytes);
}
