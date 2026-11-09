import {assert} from "./assertions.mjs";

export const reviewSourceLabels={saved:"已保存设计",ready:"待确认提案",refining:"提案正在继续调整",accepted:"提案已接受",discarded:"提案已放弃",expired:"提案已过期",superseded:"提案已被后续调整替代",unavailable:"原提案已不可用",failed:"原提案已结束",cancelled:"原提案已取消",answered:"提案已结束"};
export function reviewSourceLabel(source){if(source.kind==="saved")return reviewSourceLabels.saved;if(source.successor)return (reviewSourceLabels[source.successor.state]??"提案来源状态待核实").replace(/^(?:原)?提案/,"后续提案");return reviewSourceLabels[source.state]??"来源状态待核实";}
export function reviewKey(value){assert(typeof value==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value),"批阅归属标识无效");return value;}
export function reviewId(value){assert(typeof value==="string"&&/^[a-f0-9]{32}$/.test(value),"批阅标识无效");return value;}
export function reviewText(value){assert(typeof value==="string"&&value.trim()&&value.length<=12000,"请输入评语，最多 12000 字符");return value.trim();}
export function reviewAnchor(value){
  assert(value&&typeof value==="object"&&!Array.isArray(value),"批阅位置无效");
  for(const key of ["target","instance","selector","tag","text"])assert(typeof value[key]==="string"&&value[key].length<=(key==="selector"?2000:300),"批阅定位信息无效");
  assert(/^[a-z0-9-]*$/.test(value.tag),"批阅元素类型无效");
  for(const key of ["x","y"])assert(Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1,"批阅相对位置无效");
  assert(value.view&&["x","y","width","height"].every(key=>Number.isFinite(value.view[key])&&value.view[key]>=0),"批阅画面位置无效");
  assert(value.view.width>=320&&value.view.width<=3840&&value.view.height>=320&&value.view.height<=3840&&value.view.x<=value.view.width&&value.view.y<=value.view.height,"批阅画面尺寸无效");
  return {target:value.target,instance:value.instance,selector:value.selector,tag:value.tag,text:value.text,x:value.x,y:value.y,view:{x:value.view.x,y:value.view.y,width:value.view.width,height:value.view.height}};
}
