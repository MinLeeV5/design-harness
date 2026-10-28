const assert=(value,message)=>{if(!value)throw new Error(message);};
const reserved=new Set(["__proto__","constructor","prototype"]);
function read(control,spec,css){return control.binding==="css"?Number.parseFloat(css[control.property]):spec.elements[control.target]?.props[control.property];}
function valid(control,value){
  if(control.type==="range")return typeof value==="number"&&Number.isFinite(value)&&value>=control.min&&value<=control.max&&Math.abs((value-control.min)/control.step-Math.round((value-control.min)/control.step))<1e-6;
  return control.type==="boolean"?typeof value==="boolean":typeof value==="string"&&value.length<=2000;
}
export function validateControls(controls,spec,css){
  assert(Array.isArray(controls)&&controls.length<=4,"每次局部生成最多提供4项适用控件");const ids=new Set(),bindings=new Set();
  for(const c of controls){
    assert(c&&typeof c.id==="string"&&/^[a-z][a-z0-9-]{0,63}$/.test(c.id)&&!ids.has(c.id),"生成控件ID无效或重复");ids.add(c.id);
    assert(typeof c.label==="string"&&c.label.trim()&&c.label.length<=80&&["range","text","boolean"].includes(c.type),"生成控件定义无效");
    assert(["prop","css"].includes(c.binding)&&spec.elements[c.target]&&typeof c.property==="string"&&!reserved.has(c.property),"生成控件没有有效的写回目标");
    const address=c.binding+":"+(c.binding==="css"?c.property:c.target+":"+c.property);assert(!bindings.has(address),"多个控件不能绑定同一写回目标");bindings.add(address);
    assert(typeof c.unit==="string"&&c.unit.length<=10,"生成控件单位无效");
    if(c.type==="range")assert([c.min,c.max,c.step].every(Number.isFinite)&&c.min<c.max&&c.step>0,"生成控件范围无效");
    if(c.binding==="css")assert(c.type==="range"&&/^--[a-z][a-z0-9-]*$/.test(c.property)&&Object.hasOwn(css,c.property)&&["","px","rem","em","%","deg","ms","s"].includes(c.unit)&&String(Number.parseFloat(css[c.property]))+c.unit===css[c.property],"样式控件必须绑定候选中明确的数值变量");
    else assert(/^[a-zA-Z][a-zA-Z0-9]*$/.test(c.property)&&Object.hasOwn(spec.elements[c.target].props,c.property),"属性控件必须绑定当前页面的字面量属性");
    assert(valid(c,read(c,spec,css)),"生成控件的初始值不符合范围："+c.id);
  }
  return controls;
}
export function controlValues(controls,spec,css){return Object.fromEntries(controls.map(c=>[c.id,read(c,spec,css)]));}
export function tuneProposal(proposal,values){
  const controls=proposal.controls??[],known=new Set(controls.map(c=>c.id));
  assert(values&&typeof values==="object"&&!Array.isArray(values)&&Object.keys(values).every(id=>known.has(id)),"存在未生成的调整项");
  const next={...proposal,spec:structuredClone(proposal.spec),css:{...proposal.css}};
  for(const c of controls)if(Object.hasOwn(values,c.id)){const value=values[c.id];assert(valid(c,value),"调整值超出范围："+c.id);if(c.binding==="css")next.css[c.property]=String(value)+c.unit;else next.spec.elements[c.target].props[c.property]=value;}
  return next;
}
