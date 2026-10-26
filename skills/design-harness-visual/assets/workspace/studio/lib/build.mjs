import fs from "node:fs";
import path from "node:path";
import {build} from "esbuild";
import {Marked} from "marked";
import {createRequire} from "node:module";
import {loadRequirement, listRequirements, inside, assert, filesIn} from "./protocol.mjs";
const escape = text => String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const json = value => JSON.stringify(value).replaceAll("<","\\u003c").replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029");
const safeScript = text => text.replace(/<\/script/gi,"<\\/script");
function renderMarkdown(source) {
  const md=new Marked({renderer:{
    html({text}) {return escape(text);},
    link({href,tokens}) {
      const safe=/^(https?:\/\/|#[a-z][a-z0-9-]*$)/.test(href || "") ? href : "#";
      return '<a href="'+escape(safe)+'" target="_blank" rel="noreferrer">'+this.parser.parseInline(tokens)+'</a>';
    },
    image({text}) {return escape(text);},
    heading({text,depth,tokens}) {
      const match=/\s+\{#([a-z][a-z0-9-]*)\}\s*$/.exec(text);
      const title=match ? text.slice(0,match.index) : text;
      return "<h"+depth+(match ? ' id="'+match[1]+'"' : "")+">"+escape(title)+"</h"+depth+">";
    }
  }});
  return md.parse(source);
}
const common = {bundle:true,write:false,format:"iife",platform:"browser",target:"es2022",jsx:"automatic",
  metafile:true,minify:true,legalComments:"inline",logLevel:"silent",define:{"process.env.NODE_ENV":'"production"'},
  loader:{".png":"dataurl",".jpg":"dataurl",".jpeg":"dataurl",".webp":"dataurl",".svg":"dataurl",".gif":"dataurl",".woff":"dataurl",".woff2":"dataurl",".txt":"text"}};
function document(title, output, extraHead="") {
  const js=output.outputFiles.filter(f=>f.path.endsWith(".js")).map(f=>f.text).join("\n");
  const css=output.outputFiles.filter(f=>f.path.endsWith(".css")).map(f=>f.text).join("\n");
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+
    escape(title)+'</title>'+extraHead+"<style>"+css.replace(/<\/style/gi,"<\\/style")+'</style></head><body><div id="root"></div><script>'+
    safeScript(js)+"</script></body></html>";
}
function boundary(workspace,folder,packages) {
  return {name:"design-boundary",setup(api) {
    api.onLoad({filter:/.*/},args=>{
      const real=fs.realpathSync(args.path);
      assert(inside(folder,real) || inside(path.join(workspace,"studio"),real) || inside(packages,real),
        "设计不得导入业务代码或未固定的公共基础: "+args.path);
      return null;
    });
  }};
}
function checkImports(result) {
  for(const file of Object.values(result.metafile.outputs)) for(const entry of file.imports)
    assert(!entry.external,"离线产物不允许外部资源: "+entry.path);
}
export async function buildRequirement(workspace,id,{development=false,token=""}={}) {
  const data=loadRequirement(workspace,id);
  const previews={};
  const req=createRequire(path.join(workspace,"package.json"));
  const packages=fs.realpathSync(path.dirname(req.resolve("react/package.json")) + "/..");
  for(const candidate of data.manifest.candidates) for(const page of data.manifest.pages) {
    const entry=path.resolve(data.folder,candidate.entries?.[page.id] ?? page.entry);
    const source='import {mount} from "./studio/preview"; import Page from '+JSON.stringify(entry)+'; mount(Page);';
    const result=await build({...common,absWorkingDir:workspace,stdin:{contents:source,resolveDir:workspace,loader:"tsx",sourcefile:"dh-entry.tsx"},
      outfile:path.join(workspace,".cache","preview.js"),
      plugins:[boundary(workspace,data.folder,packages)]});
    checkImports(result);
    const csp="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none';\">";
    previews[page.id+":"+candidate.id]=document(page.title,result,csp);
  }
  const payload={manifest:data.manifest,scenarios:data.scenarios,documentation:renderMarkdown(data.documentation),
    previews,params:data.params,hashes:data.hashes,revision:data.revision,
    requirements:development ? listRequirements(workspace) : [{id,title:data.manifest.title}],development,token:development ? token : undefined};
  const studio=await build({...common,absWorkingDir:workspace,entryPoints:[path.join(workspace,"studio","app.tsx")],
    outfile:path.join(workspace,".cache","studio.js"),plugins:[boundary(workspace,data.folder,packages)]});
  checkImports(studio);
  let licenses="";
  for(const name of ["react","react-dom","scheduler"]) {
    const directory=path.dirname(req.resolve(name+"/package.json"));
    licenses += "\n"+name+"\n"+fs.readFileSync(path.join(directory,"LICENSE"),"utf8");
  }
  const html=document(data.manifest.title,studio,
    '<meta name="referrer" content="no-referrer"><script>window.__DH_DATA__='+json(payload)+";</script>"+
    '<script type="application/json" id="dh-licenses">'+json({notice:"Third-party licenses",text:licenses})+"</script>");
  return {html,data,payload};
}
export async function checkWorkspace(workspace,id) {
  const ws=JSON.parse(fs.readFileSync(path.join(workspace,"workspace.json"),"utf8"));
  assert(ws.schemaVersion===1 && ws.templateVersion==="0.2.0","工作区协议或模板版本不受支持");
  const ids=id ? [id] : listRequirements(workspace).map(item=>item.id);
  for(const current of ids) await buildRequirement(workspace,current);
  return {requirements:ids.length,templateVersion:ws.templateVersion};
}
