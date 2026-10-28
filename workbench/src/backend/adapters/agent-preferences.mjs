import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {defaultAgentSettings,validateAgentSettings,mergeAgentSettings} from "../../contracts/agent-settings.mjs";

export function createAgentPreferences({file=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),".config"),"design-harness","agent-preferences.json")}={}){
  function read(){
    if(!fs.existsSync(file))return defaultAgentSettings();
    try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>40000)throw new Error("invalid file");const value=JSON.parse(fs.readFileSync(file,"utf8"));if(value.schemaVersion!==1)throw new Error("invalid version");return validateAgentSettings(value);}
    catch{return {...defaultAgentSettings(),warning:"无法读取本机设计偏好，已使用默认设置。重新选择后可保存。"};}
  }
  async function patch(changes){
    // Reject invalid updates before creating any user files.
    mergeAgentSettings(defaultAgentSettings(),changes);
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const lock=file+".lock";let descriptor;
    for(let attempt=0;attempt<80;attempt++){
      try{descriptor=fs.openSync(lock,"wx",0o600);break;}catch(error){if(error.code!=="EEXIST")throw error;try{if(Date.now()-fs.lstatSync(lock).mtimeMs>30000)fs.unlinkSync(lock);}catch{/* Another writer may already have released the lock. */}await new Promise(resolve=>setTimeout(resolve,25));}
    }
    if(descriptor===undefined)throw new Error("设计偏好正在更新，请稍后重试。");
    const temporary=file+"."+randomBytes(8).toString("hex")+".tmp";
    try{
      if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw new Error("设计偏好文件不能使用软链接。");
      const next=mergeAgentSettings(read(),changes);fs.writeFileSync(temporary,JSON.stringify({schemaVersion:1,...next},null,2)+"\n",{flag:"wx",mode:0o600});fs.renameSync(temporary,file);return next;
    }finally{fs.rmSync(temporary,{force:true});fs.closeSync(descriptor);fs.rmSync(lock,{force:true});}
  }
  return {read,patch};
}
