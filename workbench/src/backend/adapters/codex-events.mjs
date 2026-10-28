import {StringDecoder} from "node:string_decoder";
// Only public messages and coarse tool/lifecycle activity cross into the workbench.
// Reasoning items, raw commands, tool arguments/results and structured source output stay private.
export function publicCodexEvent(event) {
  if(event?.type==="thread.started")return {id:"codex-connect",label:"已连接本机 Codex",status:"done"};
  if(event?.type==="turn.started")return {id:"codex-turn",label:"生成回复或设计修改",status:"running"};
  if(event?.type==="turn.completed")return {id:"codex-turn",label:"生成回复或设计修改",status:"done"};
  if(event?.type==="turn.failed"||event?.type==="error")return {id:"codex-turn",label:"Codex 请求失败",status:"failed"};
  if(!["item.started","item.updated","item.completed"].includes(event?.type))return null;
  const item=event.item;if(!item||typeof item.id!=="string"||typeof item.type!=="string")return null;
  if(item.type==="agent_message"){
    const text=typeof item.text==="string"?item.text.trim():"";
    // The final schema response contains code and is rendered through the proposal, never as chat JSON.
    if(event.type!=="item.completed"||!text||text.length>10000||/(?:```|~~~|[{}\[\]]|<\/?[a-z][^>]*>)/i.test(text))return null;
    return {id:"codex-message-"+item.id,label:"Agent 进展",status:"done",text};
  }
  const labels={command_execution:"执行工具",mcp_tool_call:"调用工具",web_search:"检索参考",file_change:"准备文件修改"};
  if(!Object.hasOwn(labels,item.type))return null;
  return {id:"codex-tool-"+item.id,label:labels[item.type],status:item.status==="failed"?"failed":event.type==="item.completed"?"done":"running"};
}
export function createCodexEventReader(onEvent=()=>{}) {
  const decoder=new StringDecoder("utf8");let buffer="",dropping=false;
  function feed(text){
    const lines=(buffer+text).split("\n");buffer=lines.pop();
    for(const line of lines){if(dropping){dropping=false;continue;}if(line.length>65536)continue;let parsed;try{parsed=JSON.parse(line);}catch{continue;}try{const event=publicCodexEvent(parsed);if(event)onEvent(event);}catch{/* Progress is optional; one malformed event must not interrupt the model result. */}}
    if(buffer.length>65536){buffer="";dropping=true;}
  }
  return {write:bytes=>feed(decoder.write(bytes)),end(){feed(decoder.end()+"\n");}};
}
