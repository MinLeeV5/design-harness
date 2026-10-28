import {validateSpec} from "@json-render/core";
import {assert,safeId} from "./assertions.mjs";
export function unique(items,label) {
  assert(Array.isArray(items)&&items.length>0,label+"不能为空");const ids=new Set();
  for(const item of items) {assert(safeId(item.id)&&!ids.has(item.id),label+" ID 无效或重复: "+item.id);assert(typeof item.title==="string"&&item.title.trim(),label+"缺少标题");ids.add(item.id);}
  return ids;
}
export function checkSpec(spec,label="Spec") {
  assert(spec && typeof spec==="object" && !Array.isArray(spec) && safeId(spec.root) && spec.elements && typeof spec.elements==="object" && !Array.isArray(spec.elements),"非法页面 Spec: "+label);
  for(const [id,e] of Object.entries(spec.elements))assert(safeId(id)&&e&&typeof e.type==="string"&&e.props&&typeof e.props==="object"&&!Array.isArray(e.props)&&Array.isArray(e.children),"非法 Spec 元素: "+id);
  const ids=Object.keys(spec.elements);assert(ids.length<=10000,"Spec 元素过多");
  const active=new Set(),done=new Set();
  function visit(id,depth=0){assert(depth<128,"Spec 层级过深");assert(!active.has(id),"Spec 子节点循环: "+id);if(done.has(id))return;const e=spec.elements[id];assert(e,"Spec 子节点不存在: "+id);active.add(id);for(const child of [...e.children,...Object.values(e.slots??{}).flat()])visit(child,depth+1);active.delete(id);done.add(id);}
  for(const id of ids)visit(id);
  const issues=validateSpec(spec);assert(issues.valid,"Spec 引用或结构无效: "+label+" "+JSON.stringify(issues));return spec;
}
export const pageControls = (manifest,page) => manifest.controls.filter(c=>c.page===page);
export const valuesFromSpec = (manifest,page,spec) => Object.fromEntries(pageControls(manifest,page).map(c=>[c.id,spec.elements[c.target].props[c.property]]));
export function validValue(c,value) {
  if(c.type==="range")return typeof value==="number"&&Number.isFinite(value)&&value>=c.min&&value<=c.max&&Math.abs((value-c.min)/c.step-Math.round((value-c.min)/c.step))<1e-7;
  if(c.type==="text")return typeof value==="string"&&value.length<=(c.maxLength??2000);
  return typeof value==="boolean";
}
export function validateValues(manifest,values,page) {
  assert(values&&typeof values==="object"&&!Array.isArray(values),"非法实例属性");const controls=new Map(pageControls(manifest,page).map(c=>[c.id,c]));
  for(const [id,value] of Object.entries(values))assert(controls.has(id)&&validValue(controls.get(id),value),"非法实例属性: "+id);
}
export function applyValues(manifest,page,spec,values) {
  validateValues(manifest,values,page);const next=structuredClone(spec);
  for(const c of pageControls(manifest,page))if(Object.hasOwn(values,c.id))next.elements[c.target].props[c.property]=values[c.id];
  return checkSpec(next);
}
