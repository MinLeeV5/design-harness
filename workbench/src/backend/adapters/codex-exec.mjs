import fs from "node:fs";
import {spawn} from "node:child_process";
import {createCodexEventReader} from "./codex-events.mjs";
// Codex owns its authenticated session; design files are written only by accept().
export function runCodex({directory,prompt,schemaFile,resultFile,signal,onEvent,imageFiles=[],model,spawnProcess=spawn}) {
  return new Promise((resolve,reject)=>{
    const args=["exec","--json","--ephemeral","--sandbox","read-only","--skip-git-repo-check","--cd",directory,"-c",'approval_policy="never"',"--output-schema",schemaFile,"--output-last-message",resultFile,"-"];
    args.splice(1,0,...imageFiles.flatMap(file=>["--image",file]));
    if(model?.id)args.splice(1,0,"--model",model.id);
    if(model?.effort)args.splice(1,0,"-c","model_reasoning_effort="+JSON.stringify(model.effort));
    const child=spawnProcess("codex",args,{cwd:directory,stdio:["pipe","pipe","pipe"],signal});
    let output="",errors="";const events=createCodexEventReader(onEvent);
    child.stdout.on("data",bytes=>{output=(output+bytes.toString()).slice(-200000);events.write(bytes);});
    child.stderr.on("data",bytes=>{errors=(errors+bytes.toString()).slice(-4000);});
    child.on("error",error=>reject(error.code==="ENOENT"?new Error("未找到本机 Codex；请先安装并登录 Codex"):error));
    child.on("close",code=>{
      events.end();
      if(signal.aborted){reject(new Error("生成已取消"));return;}
      if(code!==0){let message="Codex 生成失败，请检查本机登录和当前模型配置";for(const line of output.split("\n")){try{const e=JSON.parse(line);if(e.type==="turn.failed"&&e.error?.message)message=e.error.message;}catch{/* 非 JSON 诊断不作为模型结果。 */}}reject(new Error(message+(code===127?"："+errors:"")));return;}
      try{resolve(JSON.parse(fs.readFileSync(resultFile,"utf8")));}catch{reject(new Error("Codex 未返回有效的结构化修改"));}
    });
    child.stdin.on("error",()=>{});child.stdin.end(prompt);
  });
}
