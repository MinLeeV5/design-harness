import fs from "node:fs";
import path from "node:path";
import {build,transform} from "esbuild";
import {inside} from "./filesystem.mjs";
import {assert} from "../../contracts/assertions.mjs";
import {TOOL,PLUGIN,requireTool,frontendFile,previewFile,sdkFile} from "../paths.mjs";
import {dependencyDirectory,reserved} from "./dependencies.mjs";
const escape=text=>String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
export const json=value=>JSON.stringify(value).replaceAll("<","\\u003c").replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029");
const safeScript=text=>text.replace(/<\/script/gi,"<\\/script");
export const common={bundle:true,write:false,format:"iife",platform:"browser",target:"es2022",jsx:"automatic",metafile:true,minify:true,legalComments:"inline",logLevel:"silent",define:{"process.env.NODE_ENV":'"production"'},loader:{".png":"dataurl",".jpg":"dataurl",".jpeg":"dataurl",".webp":"dataurl",".svg":"dataurl",".gif":"dataurl",".woff":"dataurl",".woff2":"dataurl",".txt":"text"}};
export function document(title,output,extraHead="") {
  const js=output.outputFiles.filter(f=>f.path.endsWith(".js")).map(f=>f.text).join("\n"),css=output.outputFiles.filter(f=>f.path.endsWith(".css")).map(f=>f.text).join("\n");
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+"</title>"+extraHead+"<style>"+css.replace(/<\/style/gi,"<\\/style")+'</style></head><body><div id="root"></div><script>'+safeScript(js)+"</script></body></html>";
}
export function workbenchDocument(title,output,extraHead="") {
  const icon=fs.readFileSync(path.join(TOOL,"assets/harness-icon.png"),"base64");
  return document(title,output,'<link rel="icon" type="image/png" href="data:image/png;base64,'+icon+'">'+extraHead);
}
function boundary(allowed,sources=[]) {
  return {name:"design-boundary",setup(api){api.onLoad({filter:/.*/},args=>{const real=fs.realpathSync(args.path);assert(!sources.some(base=>inside(base,real)&&path.relative(base,real).split(path.sep).some(part=>["node_modules",".cache",".git"].includes(part))),"设计导入越界：不能从缓存或保留目录加载源码: "+args.path);assert(allowed.some(base=>inside(base,real)),"设计导入越界：只能使用当前候选、公共基础和工具依赖: "+args.path);return null;});}};
}
export async function compileBridge(file){return (await transform(fs.readFileSync(file,"utf8"),{loader:"tsx",format:"esm",target:"es2022",jsx:"automatic"})).code;}
function aliases(workspace,cache) {
  const declared=fs.existsSync(path.join(workspace,"package.json"))?JSON.parse(fs.readFileSync(path.join(workspace,"package.json"))).dependencies??{}:{};
  return {name:"fixed-runtime",setup(api){
    api.onLoad({filter:/.*/,namespace:"dh-bridge"},async args=>{
      const file=args.path==="preview"?previewFile():sdkFile();
      return {contents:file.endsWith(".tsx")?await compileBridge(file):fs.readFileSync(file,"utf8"),loader:"js",resolveDir:path.dirname(file)};
    });
    api.onResolve({filter:/.*/},args=>{
    if(args.path==="@design-harness/foundation"||args.path.startsWith("@design-harness/foundation/")){const relative=args.path==="@design-harness/foundation"?"components":args.path.slice("@design-harness/foundation/".length);assert(relative&&!relative.includes("..")&&!path.isAbsolute(relative),"非法公共基础引用");const base=path.join(workspace,"foundation",relative),file=[base,base+".tsx",base+".ts",base+".mjs",path.join(base,"index.tsx")].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());assert(file,"公共基础资源不存在: "+relative);return {path:fs.realpathSync(file)};}
    if(args.pluginData?.dhExtension&&args.importer===path.join(cache,"extension-entry.js"))return null;
    if(args.kind==="url-token"&&/^(data:|#)/.test(args.path))return null;
    if(args.path===previewFile())return {path:"preview",namespace:"dh-bridge"};
    if(args.path==="@design-harness/preview"||(args.namespace==="dh-bridge"&&args.path==="./sdk"))return {path:"sdk",namespace:"dh-bridge"};
    if(args.path.startsWith(".")||path.isAbsolute(args.path))return null;
    if(/^(https?:)?\/\//.test(args.path))throw new Error("离线产物不允许外部资源: "+args.path);
    const name=args.path.startsWith("@")?args.path.split("/").slice(0,2).join("/"):args.path.split("/")[0];
    if(reserved(name))return {path:requireTool.resolve(args.path)};
    if(args.importer&&!args.importer.includes(path.sep+"node_modules"+path.sep)&&!inside(TOOL,args.importer)){
      assert(cache&&Object.hasOwn(declared,name),"扩展依赖未声明或未安装: "+name);
      return api.resolve(args.path,{resolveDir:cache,importer:path.join(cache,"extension-entry.js"),kind:args.kind,pluginData:{dhExtension:true}});
    }
    return null;
  });}};
}
function checkImports(result){for(const file of Object.values(result.metafile.outputs))for(const entry of file.imports)assert(!entry.external||/^(data:|#)/.test(entry.path),"离线产物不允许外部资源: "+entry.path);}
export function licenseText(cache){
  let text="";for(const name of ["react","react-dom","scheduler","@json-render/core","@json-render/react","zod","marked","@base-ui/react","@base-ui/utils","@babel/runtime","@floating-ui/core","@floating-ui/dom","@floating-ui/react-dom","@floating-ui/utils","reselect","use-sync-external-store"]){
    let directory;try{directory=path.dirname(requireTool.resolve(name+"/package.json"));}catch{directory=path.dirname(requireTool.resolve(name));while(!fs.existsSync(path.join(directory,"package.json"))||JSON.parse(fs.readFileSync(path.join(directory,"package.json"))).name!==name){const parent=path.dirname(directory);assert(parent!==directory,"找不到依赖包信息: "+name);directory=parent;}}const file=["LICENSE","LICENSE.md","LICENSE.txt"].map(n=>path.join(directory,n)).find(f=>fs.existsSync(f));
    assert(file,"依赖缺少许可证: "+name);text+="\n"+name+"\n"+fs.readFileSync(file,"utf8");
  }
  if(cache){const lock=JSON.parse(fs.readFileSync(path.join(cache,"package-lock.json")));for(const relative of Object.keys(lock.packages??{}).filter(k=>k.startsWith("node_modules/"))){const dir=path.join(cache,relative),pkg=JSON.parse(fs.readFileSync(path.join(dir,"package.json")));const license=["LICENSE","LICENSE.md","LICENSE.txt","license","license.md"].map(n=>path.join(dir,n)).find(f=>fs.existsSync(f));assert(license,"扩展依赖缺少许可证文件: "+pkg.name);text+="\n"+pkg.name+" "+pkg.version+"\n"+fs.readFileSync(license,"utf8");}}
  text+="\nImpeccable Live DOM helpers\n"+fs.readFileSync(path.join(TOOL,"vendor/impeccable/NOTICE.md"),"utf8")+"\n"+fs.readFileSync(path.join(TOOL,"vendor/impeccable/LICENSE"),"utf8");
  return text;
}
export async function buildApp() {
  const packages=fs.realpathSync(path.join(PLUGIN,"node_modules"));
  const result=await build({...common,absWorkingDir:PLUGIN,entryPoints:[frontendFile()],outfile:"/virtual/design-harness/app.js",plugins:[boundary([TOOL,packages])]});checkImports(result);return result;
}

export async function buildCandidate(workspace,data,candidate,cache) {
  const packages=fs.realpathSync(path.join(PLUGIN,"node_modules"));
    const source='import {mount} from '+JSON.stringify(previewFile())+'; import * as project from '+JSON.stringify(path.join(data.folder,candidate.registry))+'; mount(project);';
    let result;try {result=await build({...common,absWorkingDir:PLUGIN,stdin:{contents:source,resolveDir:TOOL,loader:"tsx",sourcefile:"preview-entry.tsx"},outfile:"/virtual/design-harness/preview.js",plugins:[aliases(workspace,cache),boundary([data.candidateRoots[candidate.id],data.foundationRoot,TOOL,packages,...(cache?[cache]:[])],[data.candidateRoots[candidate.id],data.foundationRoot])]});}
    catch(error){throw new Error("候选 "+candidate.id+" 构建失败："+error.message);}
    checkImports(result);
    const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\';">';
    return {result,csp};
}
