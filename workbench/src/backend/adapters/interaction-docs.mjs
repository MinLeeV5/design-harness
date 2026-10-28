import {parseDocument} from "yaml";
import {Marked} from "marked";
import {renderMarkdown} from "../../contracts/markdown.mjs";

const id=value=>typeof value==="string"&&/^[a-z][a-z0-9-]{0,63}$/.test(value);
const record=value=>value&&typeof value==="object"&&!Array.isArray(value);
const scalar=value=>value===null||typeof value==="boolean"||typeof value==="string"||typeof value==="number"&&Number.isFinite(value);
const check=(valid,message)=>{if(!valid)throw new Error(message);};
const keys=(object,allowed,label)=>{check(record(object),label+"必须是对象");for(const key of Object.keys(object))check(allowed.includes(key),label+"不支持字段："+key);};
export function parseInteractionDocument(source,{file,pages}) {
  check(source.length<=500000,"交互文档过大："+file);
  const match=/^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  check(match,"交互文档缺少 YAML 配置："+file);
  const parsed=parseDocument(match[1],{uniqueKeys:true,stringKeys:true});
  check(!parsed.errors.length&&!parsed.warnings.length,"交互文档 YAML 无效："+file+" "+[...parsed.errors,...parsed.warnings].map(error=>error.message).join("；"));
  const meta=parsed.toJS({maxAliasCount:0});
  keys(meta,["schemaVersion","page","annotations","sources"],file);
  check(meta.schemaVersion===1&&(meta.page==="*"||pages.has(meta.page)),"交互文档页面或版本无效："+file);
  check(Array.isArray(meta.annotations)&&meta.annotations.length>0,"交互文档缺少 annotations："+file);
  const sources=meta.sources??[];
  check(Array.isArray(sources),"交互说明 sources 必须是数组："+file);
  for(const item of sources){keys(item,["kind","ref"],"说明来源");check(["user","prd","code","design"].includes(item.kind)&&typeof item.ref==="string"&&item.ref.trim()&&item.ref.length<=2000,"说明来源无效："+file);}
  const tokens=new Marked().lexer(source.slice(match[0].length)),sections=new Map();let current;
  for(const token of tokens){
    if(token.type==="heading"&&token.depth===2){const anchor=/^(.*?)\s+\{#([a-z][a-z0-9-]*)\}$/.exec(token.text);check(anchor,"交互说明二级标题需要稳定锚点："+file);check(!sections.has(anchor[2]),"交互说明锚点重复："+anchor[2]);current={label:anchor[1],tokens:[]};sections.set(anchor[2],current);}
    else if(current)current.tokens.push(token);
  }
  const result=meta.annotations.map(annotation=>{
    keys(annotation,["id","target","view","placement","when"],"标注");
    check(id(annotation.id)&&typeof annotation.target==="string"&&/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?$/.test(annotation.target),"交互说明标识或目标无效："+file);
    const section=sections.get(annotation.id);check(section,"交互说明缺少正文："+annotation.id+" / "+file);
    const view=annotation.view??"card",placement=annotation.placement??"auto",when=annotation.when??{};
    check(["card","steps","rules","states"].includes(view),"交互说明展示模式无效："+annotation.id);
    check(["auto","top","right","bottom","left"].includes(placement),"标注位置无效："+annotation.id);
    check(record(when)&&Object.keys(when).every(path=>/^\/(?:[^~\/]|~[01])+(?:\/(?:[^~\/]|~[01])+)*$/.test(path)),"标注状态条件需要 JSON Pointer："+annotation.id);
    for(const value of Object.values(when))check(scalar(value)||Array.isArray(value)&&value.length>0&&value.every(scalar),"标注状态条件只支持值或值数组："+annotation.id);
    let lead="";const blocks=[];let block;
    for(const token of section.tokens){if(token.type==="heading"&&token.depth===3){block={title:token.text,source:""};blocks.push(block);}else if(block)block.source+=token.raw;else lead+=token.raw;}
    const summaryToken=section.tokens.find(token=>token.type==="paragraph");
    return {id:annotation.id,page:meta.page,target:annotation.target,label:section.label,view,placement,when,file,sources,summary:summaryToken?.text??section.label,intro:renderMarkdown(lead),blocks:blocks.map(({title,source})=>({title,html:renderMarkdown(source)})),html:renderMarkdown(section.tokens.map(token=>token.raw).join(""))};
  });
  check(new Set(result.map(item=>item.id)).size===result.length&&sections.size===result.length,"说明正文与标注必须一一对应："+file);
  return result;
}
