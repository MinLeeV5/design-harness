import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {filesIn} from "./filesystem.mjs";
import {assert} from "../../contracts/assertions.mjs";
import {loadProject} from "./resource-store.mjs";
import {TOOL,PLUGIN,packageDirectory,sdkFile} from "../paths.mjs";
import {dependencyDirectory} from "./dependencies.mjs";
export async function typecheck(workspace,{signal}={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"design-harness-types-"));
  try {
    const manifest=JSON.parse(fs.readFileSync(path.join(PLUGIN,"package.json"),"utf8")),paths={};
    for(const name of Object.keys(manifest.dependencies)) {
      const directory=packageDirectory(name);paths[name]=[directory];paths[name+"/*"]=[path.join(directory,"*")];
    }
    Object.assign(paths,{"@json-render/react/schema":[path.join(packageDirectory("@json-render/react"),"dist/schema.d.ts")],"@design-harness/preview":[sdkFile()],"react":[path.join(packageDirectory("@types/react"),"index.d.ts")],"react/*":[path.join(packageDirectory("@types/react"),"*")],"react-dom":[path.join(packageDirectory("@types/react-dom"),"index.d.ts")],"react-dom/*":[path.join(packageDirectory("@types/react-dom"),"*")]});
    const files=filesIn(TOOL).filter(f=>/\.(?:ts|tsx)$/.test(f)&&!f.includes(path.sep+"starter"+path.sep));
    if(workspace){loadProject(workspace);paths["@design-harness/foundation"]=[path.join(workspace,"foundation/components.tsx")];paths["@design-harness/foundation/*"]=[path.join(workspace,"foundation/*")];const cache=dependencyDirectory(workspace);if(cache)paths["*"]=[path.join(cache,"node_modules/*")];for(const base of ["foundation","requirements"])if(fs.existsSync(path.join(workspace,base)))files.push(...filesIn(path.join(workspace,base)).filter(f=>/\.(ts|tsx)$/.test(f)));}
    const config={compilerOptions:{target:"ES2022",lib:["ES2022","DOM","DOM.Iterable"],jsx:"react-jsx",module:"ESNext",moduleResolution:"Bundler",strict:true,noEmit:true,skipLibCheck:true,types:[],paths},files};
    fs.writeFileSync(path.join(directory,"tsconfig.json"),JSON.stringify(config));
    const cli=path.join(packageDirectory("typescript"),"bin/tsc");
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[cli,"-p",path.join(directory,"tsconfig.json"),"--pretty","false"],{signal,stdio:["ignore","pipe","pipe"]});let output="",failure;
      const collect=bytes=>{output=(output+bytes.toString()).slice(-30000);};child.stdout.on("data",collect);child.stderr.on("data",collect);
      child.on("error",error=>{failure=error;});child.on("close",code=>{if(failure)reject(failure);else if(code!==0)reject(new Error("类型检查失败：\n"+output));else resolve();});
    });return {files:files.length,checked:workspace?"tool-and-project":"tool"};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
