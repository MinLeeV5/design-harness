import {StringDecoder} from "node:string_decoder";
const limit=24000;
const bounded=value=>typeof value==="string"?value.slice(0,limit):"";
const completedStatus=(event,item)=>["failed","declined"].includes(item.status)?"failed":event.type==="item.completed"?"done":"running";
// Only explicit public summaries are accepted. Raw reasoning blocks and the
// final structured proposal never cross into chat activity.
export function publicCodexEvent(event) {
  if(event?.type==="thread.started")return {id:"codex-connect",label:"已连接本机 Codex",status:"done"};
  if(event?.type==="turn.started")return {id:"codex-turn",label:"生成回复或设计修改",status:"running"};
  if(event?.type==="turn.completed")return {id:"codex-turn",label:"生成回复或设计修改",status:"done"};
  if(event?.type==="turn.failed"||event?.type==="error")return {id:"codex-turn",label:"Codex 请求失败",status:"failed"};
  if(!["item.started","item.updated","item.completed"].includes(event?.type))return null;
  const item=event.item;if(!item||typeof item.id!=="string"||typeof item.type!=="string")return null;
  if(item.type==="reasoning"){
    const text=Array.isArray(item.summary)?item.summary.filter(s=>typeof s==="string").join("\n\n"):"";
    return text?{id:"codex-summary-"+item.id,label:"思考摘要",kind:"reasoning",status:completedStatus(event,item),text:bounded(text)}:null;
  }
  if(item.type==="agent_message"){
    const text=typeof item.text==="string"?item.text.trim():"";
    // The final schema response contains code and is rendered through the proposal, never as chat JSON.
    if(!text||item.phase==="final_answer")return null;
    if(!["commentary","partial_answer"].includes(item.phase)&&(event.type!=="item.completed"||/(?:```|~~~|[{}\[\]]|<\/?[a-z][^>]*>)/i.test(text)))return null;
    return {id:"codex-message-"+item.id,label:"Agent 进展",kind:"message",status:completedStatus(event,item),text:bounded(text)};
  }
  const labels={command_execution:"执行工具",mcp_tool_call:"调用工具",web_search:"检索参考",file_change:"准备文件修改"};
  if(!Object.hasOwn(labels,item.type))return null;
  const result={id:"codex-tool-"+item.id,label:labels[item.type],kind:"tool",status:completedStatus(event,item)};
  if(item.type==="command_execution"){
    result.kind="command";result.label="执行命令";
    if(typeof item.command==="string")result.command=bounded(item.command);
    if(typeof item.cwd==="string")result.cwd=bounded(item.cwd);
    const output=item.aggregatedOutput??item.aggregated_output;
    if(typeof output==="string"){result.output=bounded(output);result.truncated=output.length>limit;}
    if(Number.isInteger(item.exitCode??item.exit_code))result.exitCode=item.exitCode??item.exit_code;
  }else if(item.type==="mcp_tool_call"){
    result.label="调用工具"+(item.server||item.tool?" · "+[item.server,item.tool].filter(s=>typeof s==="string").join(" / "):"");
    const output=item.result?.content?.filter?.(part=>part.type==="text"&&typeof part.text==="string").map(part=>part.text).join("\n");if(output)result.output=bounded(output);
    if(item.error)result.text=bounded(typeof item.error==="string"?item.error:item.error.message);
  }else if(item.type==="web_search"&&typeof item.query==="string")result.text=bounded(item.query);
  else if(item.type==="file_change"&&Array.isArray(item.changes))result.text=bounded(item.changes.map(change=>change.path).filter(s=>typeof s==="string").join("\n"));
  return result;
}
export function createCodexActivityStream(onEvent){
  const items=new Map(),phases=new Map();
  function emit(event){if(!event)return;const previous=items.get(event.id)??{},next={...previous,...event};if(items.size>=256&&!items.has(event.id))return;items.set(event.id,next);try{onEvent({...next});}catch{/* Observers cannot affect execution. */}}
  return message=>{
    const p=message.params??{},method=message.method,item=p.item;
    if(item?.type==="agentMessage")phases.set(item.id,item.phase);
    const names={agentMessage:"agent_message",commandExecution:"command_execution",mcpToolCall:"mcp_tool_call",fileChange:"file_change",webSearch:"web_search"};
    if(method==="item/reasoning/summaryTextDelta"||method==="item/reasoning/summaryPartAdded"){
      const id="codex-summary-"+p.itemId,previous=items.get(id)?.text??"",delta=method.endsWith("summaryPartAdded")?(previous?"\n\n":""):p.delta;
      if(typeof delta==="string")emit({id,label:"思考摘要",kind:"reasoning",status:"running",text:bounded(previous+delta)});return;
    }
    if(method==="item/agentMessage/delta"){
      if(!["commentary","partial_answer"].includes(phases.get(p.itemId)))return;
      const id="codex-message-"+p.itemId;emit({id,label:"Agent 进展",kind:"message",status:"running",text:bounded((items.get(id)?.text??"")+(typeof p.delta==="string"?p.delta:""))});return;
    }
    if(method==="item/commandExecution/outputDelta"){
      const id="codex-tool-"+p.itemId,output=(items.get(id)?.output??"")+(typeof p.delta==="string"?p.delta:"");emit({id,label:"执行命令",kind:"command",status:"running",output:bounded(output),truncated:items.get(id)?.truncated||output.length>limit});return;
    }
    emit(publicCodexEvent({type:method==="turn/completed"&&p.turn?.status==="failed"?"turn.failed":method?.replaceAll("/","."),item:item?{...item,type:names[item.type]??item.type}:undefined}));
  };
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
