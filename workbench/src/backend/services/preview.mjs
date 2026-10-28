import {loadRequirement,listRequirements,loadProject} from "../adapters/resource-store.mjs";
import {canonicalDirectory} from "../adapters/filesystem.mjs";
import {dependencyDirectory} from "../adapters/dependencies.mjs";
import {renderMarkdown} from "../../contracts/markdown.mjs";
import {buildApp,buildCandidate,document,workbenchDocument,json,licenseText} from "../adapters/bundler.mjs";

export async function buildRequirement(workspace,id,{development=false,token=""}={}) {
  workspace=canonicalDirectory(workspace);
  const data=loadRequirement(workspace,id),previews={},cache=dependencyDirectory(workspace);
  for(const candidate of data.manifest.candidates) {
    const {result,csp}=await buildCandidate(workspace,data,candidate,cache);
    for(const page of data.manifest.pages) previews[page.id+":"+candidate.id]=document(page.title,result,csp);
  }
  const payload={manifest:data.manifest,scenarios:data.scenarios,interactions:data.interactions,documentation:renderMarkdown(data.documentation,{prefix:"overview-"}),previews,specs:data.specs,params:data.params,hashes:data.hashes,revision:development?data.revision:"offline",requirements:development?listRequirements(workspace):[{id,title:data.manifest.title}],development,token:development?token:undefined};
  const app=await buildApp();const html=workbenchDocument(data.manifest.title,app,'<meta name="referrer" content="no-referrer"><script>window.__DH_DATA__='+json(payload)+";</script>"+'<script type="application/json" id="dh-licenses">'+json({notice:"Third-party licenses",text:licenseText(cache)})+"</script>");
  return {html,data,payload};
}
export async function checkWorkspace(workspace,id) {loadProject(workspace);const ids=id?[id]:listRequirements(workspace).map(item=>item.id);for(const current of ids)await buildRequirement(workspace,current);return {requirements:ids.length,renderer:"json-render/react"};}
