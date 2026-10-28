import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {assert} from "../../contracts/assertions.mjs";
import {inside} from "./filesystem.mjs";

export function hostProjectRoot(workspace,explicit) {
  workspace=fs.realpathSync(workspace);
  if(explicit){const root=fs.realpathSync(explicit);assert(inside(root,workspace),"设计资源不在指定宿主项目内");if(root!==workspace)return root;}
  try {
    const root=fs.realpathSync(execFileSync("git",["-C",workspace,"rev-parse","--show-toplevel"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim());
    if(inside(root,workspace))return root;
  }catch{/* Non-Git projects retain the standard resource-directory boundary. */}
  return path.basename(workspace)==="design-harness"?path.dirname(workspace):workspace;
}
