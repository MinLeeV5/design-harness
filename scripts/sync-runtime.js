// Synchronize self-contained instructions, launchers and business templates. Workbench code stays at the plugin root.
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const source=path.join(root,"skills/design-harness-init");
const shared=["assets/workspace","scripts/harness.mjs","references/fidelity.md","references/workspace.md","references/protocol.md","references/interactions.md","references/preview-export.md","references/handoff.md"];
for(const name of ["design-harness-interaction","design-harness-visual","design-harness-writeback"]) {
  for(const relative of shared) {
    const target=path.join(root,"skills",name,relative);
    fs.rmSync(target,{recursive:true,force:true});
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.cpSync(path.join(source,relative),target,{recursive:true});
  }
}
console.log("Four entry instructions and business resource templates synchronized.");
