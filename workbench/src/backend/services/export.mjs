import {assert} from "../../contracts/assertions.mjs";
import {canonicalDirectory} from "../adapters/filesystem.mjs";
import {loadRequirement} from "../adapters/resource-store.mjs";
import {resolveExportFile,writeExportFile} from "../adapters/export-file.mjs";
import {buildRequirement} from "./preview.mjs";

export async function exportHtml(workspace,id) {
  workspace=canonicalDirectory(workspace);
  const {html,data}=await buildRequirement(workspace,id);
  assert(loadRequirement(workspace,id).revision===data.revision,"导出期间设计资源已变化，请重新导出");
  return {html,filename:id+".html"};
}

export async function exportToFile(workspace,id,output) {
  const file=resolveExportFile(workspace,output);
  const {html}=await exportHtml(workspace,id);
  writeExportFile(file,html);
  return {file,bytes:Buffer.byteLength(html)};
}
