# 项目资源协议

当前只支持 schemaVersion: 1、renderer: "json-render/react"。工具使用当前插件引擎；尚未发布的旧试跑需重新整理资源，不维护旧 studio 协议兼容层。离线 HTML 可独立体验，重建采用当前插件和共享基础。

## 入口与共享基础

project.json 包含 schemaVersion、renderer 与 name，不保存插件绝对路径。foundation/ 保存组件、catalog.ts、registry.tsx、Token、规则与素材；foundation.json 保存 schemaVersion、version、status。项目只保留这一处基础；manifest.foundation 为 shared，工具读取当前基础版本显示和记录，不在需求固定副本。共享组件用 @design-harness/foundation/... 引用。

manifest.json：

- id、title、schemaVersion、renderer、foundation: "shared"。
- pages: [{id,title}]；viewports: [{id,title,width,height}]，实际尺寸 320–3840。
- candidates: [{id,title,registry,params,pages}]。pages 为页面 ID 到完整 Spec 路径的映射；每套候选提供全部页面。registry、params、Spec 均在 candidates/<候选>/ 内，不共用另一候选文件。
- controls: 实例属性编辑白名单，见下文。
- navigation: 可选 {pageStatePath: "/route"}，用于无自定义离开保护的 store 路由；其他路由走 SDK 适配。

ID 使用小写字母开头的字母、数字和连字符。资源路径相对需求目录；拒绝绝对路径、软链接和越界。组件编译仅允许当前候选、项目公共基础、工具 SDK 和已安装依赖，不导入业务工程或其他候选。

## json-render 与组件注册

使用 @json-render/core 的 defineCatalog、@json-render/react/schema 的 schema 和 zod 声明组件属性、slots 及动作。Registry 使用 @json-render/react 的 defineRegistry，导出 catalog、registry，可选 handlers。组件使用 BaseComponentProps、emit 与 useStateStore 等上游接口；不自行复制渲染引擎。

页面沿用原生 root/elements：

```json
{"root":"panel","elements":{"panel":{"type":"Surface","props":{},"children":[]}},"state":{}}
```

Spec 保存页面组合与实例属性，React 保存组件内部实现。工具先验证引用、循环和资源边界，在隔离浏览器中实际执行项目 Catalog 校验与 Registry 注册；失败显示具体组件／属性，不静默丢弃。接纳 Spec 时还核对 on/watch 及成功／失败回调中的动作名与实现，保留上游内建动作；运行异常向工作台回报。check 的结构／构建成功不等于浏览器 Catalog 或交互验证通过。

固定 SDK @design-harness/preview 提供 useScenario()、designPart("submit")、usePreviewNavigation() 和 usePreviewState()。上游生产构建通过受控桥接启用 data-jr-key 定位；组件内部可用 designPart 暴露子目标，目标写为元素 ID/子目标。重复实例共享 Spec key，通过 useRepeatScope 的 basePath 保留运行时实例地址；点选、高亮与聊天附件使用该地址区分行。Agent 修改仍作用于 Spec 定义，逐行设计差异应使用独立元素或场景数据，不把重复渲染误当成独立源码。

## 场景与说明

scenarios.json 为 [{id,page,title,state}]，只保存预置场景。state 与 Spec.state 合成体验初始状态；只有选择预置场景或显式重置才初始化。普通导航、打开面板和 Agent 调整不重置体验状态。

交互正文与标注配置统一保存到需求自己的 interactions/*.md，采用 YAML 配置＋Markdown 正文。页面归属、稳定 ID、目标、条件与展示模式遵循[交互说明协议](interactions.md)，不写在组件中，不在场景中重复维护。工作台内置卡片、步骤、规则表和状态对照，当前说明及标注跟随真实页面与运行状态变化。

自定义路由通过 usePreviewNavigation 接入实际导航与离开保护，usePreviewState 发布条件说明需要的可观察状态。简单 store 路由可声明 manifest.navigation.pageStatePath。产品入口使用 hook 返回的导航请求，beforeNavigate 只确认离开保护，navigate 在通过后提交。对比时双方通过才切页，任一取消都保留原页和草稿；切换编辑方案保持两侧位置与会话。场景、重置、视口与标注定位联动，业务状态和源文件写回独立。完整接入、状态保留边界和验证方法见[交互说明协议](interactions.md)。

## 候选参数与实例属性

params.json 保存 {"css":{"--自定义变量":"值"}}，属于候选独立资源；Spec 保存实例属性。manifest.controls 保留登记属性的约束与受控保存接口，不作为打开 Agent 时的预设参数面板。

登记 controls 项包含 id、label、page、target、property、type；property 为一级字面量属性名，range 包含 min/max/step，可选 unit，text 可选 maxLength，boolean 为布尔值。各候选目标与初始值必须满足约束。直接保存接口按原 Spec 哈希比较，冲突拒绝覆盖。

生成结果可返回0–4项本次控件，字段为 id、label、type、binding、target、property、min、max、step、unit。binding=prop 只绑定当前页面已存在的 Spec 字面量属性；binding=css 只允许 range，绑定候选 params 中的数值变量，且该变量必须已在候选 React／CSS 中引用。CSS值为数值加明确单位。非法目标、表达式、范围和未生成控件的值均拒绝，不把任意 DOM 样式直接反写为源码。控件定义属于本次临时预览，接受只将选定值落实到 Spec／params；再次调整按当前资源生成。

## 扩展依赖

React、json-render、zod 和渲染工具由插件固定，项目不能覆盖。可选 package.json 只允许 dependencies 中的精确 npm 版本，不承载工具 scripts/devDependencies；运行 deps 生成或更新 dependencies.lock.json；构建和插件重建使用项目当前匹配锁；不隐式更新依赖。依赖安装使用 --ignore-scripts，缓存位于用户缓存目录的 design-harness/business。项目文件不包含 node_modules 或工具配置，工具不执行项目构建脚本。

## Agent 会话与处理活动

本地服务提供 message／accept／discard／cancel 事件与令牌保护的会话读取。统一 message 支持讨论和视觉修改，附件可选；结构化结果包含 summary、files、controls，纯回答的 files／controls 为空。只有用户发送时调用本机 Codex，沿用账号和模型配置，不执行项目脚本。

每轮保存用户消息与一条持续更新的 Agent 消息，固定发送时的页面和元素上下文。Agent 消息包含 state、startedAt／completedAt 与 activity 列表，记录实际阶段、公开进展和工具状态。JSONL 读取支持分块和 UTF-8 边界，只转发允许的公开消息及粗粒度工具元数据；过滤内部推理、原始命令／工具输入输出与最终源码 JSON。客户端轮询更新同一条消息，按真实活动显示 loading／耗时；失败和取消补齐结果状态。当前服务会话完整保存在内存，模型上下文按最近对话取用；服务重启清空，不写项目日志。

继续修改通过 baseJob 承接当前暂存代码和控件值。修改只限当前候选，接受前核对完整 revision 和最终控件值，重新验证调节后的临时资源，再写 Spec／React／CSS／params。纯回答不写项目；细化失败或显式取消保留上一版预览；放弃、离开页面／候选及关闭服务清理整条暂存。离线不启动 Agent，共享基础与跨候选变更按已有授权单独处理。

## 保真与交接

requirement.md 记录声明范围、基线版本／环境、沿用与新增区域、证据及差异。完整 UI 的壳层、真实控件、菜单和状态按[交付保真](fidelity.md)逐区核对；后端可以本地模拟，界面与交互不能因此简化。用户确认、保真结果与工程检查分别记录在 handoff.md。验证用截图和日志临时清理，不维护 evidence 目录；项目不维护交付源码副本、runtime 或验证产物。
