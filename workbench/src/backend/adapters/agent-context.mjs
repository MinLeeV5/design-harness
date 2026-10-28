import fs from "node:fs";
import path from "node:path";
import {PLUGIN} from "../paths.mjs";

export function prepareAgentContext({data,request,disposition,identity,temp,currentImage,referenceFiles,hostProject,sourceResources,sourceRequirement}) {
  const context=path.join(temp,"context");fs.mkdirSync(context);
  const write=(name,value)=>{const file=path.join(context,name);fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n");return file;};
  const entries=[],add=(file,purpose,when)=>{if(fs.existsSync(file))entries.push({path:file,purpose,when,kind:fs.statSync(file).isDirectory()?"directory":"file"});};
  const candidate=data.manifest.candidates.find(item=>item.id===request.candidate);
  const roots={hostProject,sourceResources,sourceRequirement,proposal:path.dirname(path.dirname(data.folder)),requirement:data.folder,plugin:PLUGIN};
  add(identity.entry,"当前内部身份入口","核对执行职责与专业边界时");
  for(const guide of identity.resources)add(guide.path,guide.purpose,guide.when);
  for(const name of ["AGENTS.md","README.md"])add(path.join(hostProject,name),"宿主规则与知识入口（调查参考）","调查宿主实现前；继续定位更小范围规则，不扩展身份权限");
  add(path.join(hostProject,"docs"),"宿主文档入口","业务背景或实现事实不足时，先检索入口");
  add(path.join(roots.proposal,"project.json"),"项目组织配置（只读）","核对设计归属时");
  for(const [name,purpose,when] of [
    ["requirement.md","需求目标、范围和验收","开始设计或核对目标时"],
    ["handoff.md","已确认决定、来源与未决项","承接既有设计或判断完成状态时"],
    ["manifest.json","页面、候选、导航与视口","定位页面或修改共享登记前"],
    ["interactions","交互说明与状态条件","修改行为或解释交互时，先定位相关条目"],
    ["scenarios.json","体验初始场景","核对或修改初始场景时"],
    [candidate.pages[request.page],"当前页面 Spec","理解页面或修改实例属性时"],
    [candidate.registry,"当前候选组件注册入口","追踪组件实现时"],
    [candidate.params,"当前候选参数","修改已使用的 CSS 参数时"],
    [`candidates/${candidate.id}/catalog.ts`,"候选组件与动作契约","修改属性或动作前"],
    [`candidates/${candidate.id}`,"当前候选实现与素材","沿 import 或搜索结果读取相关实现"],
    ["candidates","其他候选入口（已有实现只读）","共享契约变化或新增页面时"]
  ])add(path.join(data.folder,name),purpose,when);
  add(data.foundationRoot,"公共组件、Token、规则和素材（只读）","沿当前组件引用定位，避免整库读取");
  for(const name of ["design.md","catalog.ts","registry.tsx","tokens.css"])add(path.join(data.foundationRoot,name),"公共设计基础入口（只读）","需要相应规则、契约或 Token 时");
  add(write("state.json",request.capture?.state??{}),"当前实际运行状态","核对行为、条件或反馈时");
  if(request.selection)add(write("selection.json",request.selection),"点选 DOM、样式与祖先","定位点选元素时");
  if(currentImage)add(currentImage,"当前实际 DOM 静态截图；使用图片工具查看","视觉判断或视觉修改前必读");
  referenceFiles.forEach((file,i)=>add(file,`用户参考图（已直接附图）：${request.references[i].name}`,"直接附图不足以辨认或需要局部核对时再读取"));
  const map={roots,identity:{id:identity.skill,label:identity.label,entry:identity.entry},current:{page:request.page,candidate:request.candidate,viewport:{width:request.capture?.width,height:request.capture?.height},selection:request.selection?{target:request.selection.target,instance:request.selection.instance,label:request.selection.label,tag:request.selection.tag}:null},revision:disposition.revision,entries};
  write("resource-map.json",map);return map;
}
