# 固定工作台与资源渲染

## 源码架构与依赖

工作台采用本地运行的模块化结构，随完整插件启动和分发。公开命令保持 `workbench/cli.mjs`，内部实现集中在 `workbench/src/`；HTTP 和 CLI 调用相同应用服务。当前设计资源仍以项目文件为维护来源。

| 目录 | 职责 |
| --- | --- |
| `src/cli/` | 命令解析、输出和服务启动 |
| `src/frontend/app/` | 工作台壳层、布局和功能协调 |
| `src/frontend/features/` | Agent 会话与展示、画布、导航协调、交互说明 |
| `src/frontend/ui/` | 选择器等跨功能 UI 基础组件与样式 |
| `src/frontend/api/` | 本地 HTTP 客户端、父页面与预览的画面捕获请求 |
| `src/preview/` | 隔离 iframe 内的渲染、导航 SDK、DOM 点选与静态快照 |
| `src/backend/http/` | HTTP 生命周期、访问校验、路由、请求与响应 |
| `src/backend/services/` | 工作区保存、提案生命周期与范围校验、预览构建编排、导出 |
| `src/backend/adapters/` | 文件资源与暂存、Codex 接入、Skill 上下文、编译、类型和浏览器校验 |
| `src/contracts/` | 跨端数据、预览配置、身份、条件、控件与资源的纯校验规则 |

前端只依赖自身与 contracts，通过 API 使用后端。预览只依赖自身、contracts 与声明的 vendor 资源；SDK 不依赖工作台 UI。contracts 不依赖 React、浏览器实现或 Node 原生能力。HTTP 只调用 services，services 通过 adapters 使用文件和外部进程；adapters 不反向依赖 services 或 HTTP。CLI 是本地组合入口，可接入服务与命令所需适配器。`backend/paths.mjs` 集中解析插件、工作台与各编译入口，禁止按 App 文件是否存在猜测根目录。

保存实例属性由 workspace 服务检查源版本和计算 Spec，文件适配器负责原子替换。Agent runtime 管理会话、活动和任务状态，提案校验与文件暂存、调节、提交、恢复分别由对应模块负责；Codex 进程与公开事件解析独立维护。预览服务编排资源、候选和 payload，bundler 负责实际编译与内嵌 HTML。

Agent 会话、消息与审批统一使用 frontend/features/agent/AgentStatus 的状态文案、图标与颜色。会话菜单在标题右侧展示状态图标，完整状态保留悬停说明和可访问名称，当前会话使用独立勾选；消息与审批保留图标和短文字。处理使用紫色进度环，待审批使用琥珀色提醒，接受与完成使用绿色圆勾；失败、回复及取消通过不同图形区分，减少动态效果时停止进度环动画。展示层不改变任务状态或审批权限。

`starter/`、`assets/`、`vendor/` 保留各自资源用途。项目 foundation、requirements、公开 CLI、预览 SDK 别名和离线 HTML 行为保持原协议。未来云端化可沿服务边界演进存储与执行接入，账号、协作、并发和云端任务仍需按实际需求设计。

架构边界由 [architecture.js](../scripts/architecture.js) 检查，并纳入 `npm run validate` 与插件打包；行为由类型检查、工作区测试和真实浏览器验证。

## 职责与协议

插件 [workbench/](../workbench/cli.mjs) 提供固定工具；项目只维护业务资源。加载器读取 project.json、需求清单、项目公共基础、候选 Catalog／Registry、完整原生 Spec、场景及说明，不执行项目构建配置。

[资源协议](../shared/references/protocol.md)与[加载校验](../workbench/src/backend/adapters/resource-store.mjs)一起维护。json-render 0.21.3 的 Spec 维护组合和实例属性，自定义 React 组件维护精确外观和复杂行为。Catalog 定义 Zod 属性与动作，Registry 提供实现；项目可扩展业务组件，无需改固定工作台。

项目只保留根目录 foundation 一份源码，需求和候选用 @design-harness/foundation/... 引用。公共更新影响已有需求，重建后的交付也采用最新基础，维护时检查向下兼容。各候选有独立 Spec、参数和专属实现；克隆复制全部候选文件。当前统一最新协议，不保留旧 studio 模式兼容层。

project.json 的 designOrganization 保存已确认组织方式，contracts/design-organization 统一校验配置与创建边界；workspace 文件适配器保存配置，CLI init／organization／new 复用该边界。持续模式记录 primary，普通新建只允许主稿，独立例外须显式 --separate，基础预览用 --preview；工作台默认进入已建立主稿。模式缺失时仍可读取旧资源，不自动推断。loadRequirement 返回冻结的项目配置，Agent 每轮从提案副本读取模式、主稿与用途，并装载共享组织指导；配置变化纳入 revision，旧提案不能继续接受。基础预览不是产品主稿，项目配置也不属于工作台提案写入范围。

工具依赖固定在插件；可选业务 package.json 只声明精确版本的 dependencies，锁定到 dependencies.lock.json。deps 使用 --ignore-scripts 安装到用户缓存目录；deps 显式更新扩展锁；构建与重建使用项目当前匹配锁和外部缓存。项目不产生 node_modules 或工具配置。构建将 React/json-render/zod 固定到插件，避免重复 React 或业务覆盖引擎。

## 构建与隔离

esbuild 从各候选 registry 生成浏览器 IIFE，嵌入 CSS、图片与字体；实际解析文件只能位于该候选、项目公共基础、工具或依赖目录。其他候选和业务工程导入均拒绝；离线外部资源拒绝。

工具编译只引用自身和工具依赖，不加载业务 Registry 到父页面。项目代码只在 sandbox="allow-scripts allow-downloads" 的 iframe 中执行，没有 allow-same-origin。CSP 禁止网络连接与远程资源。该隔离用于本地可信设计资源，不承诺对恶意项目实施 CPU／内存资源限额。

工作台 HTML 的 favicon 复用 `workbench/assets/harness-icon.png`，在构建时以内嵌 PNG data URL 写入 `<head>`；本地服务与离线导出共用此入口，候选产品 iframe 继续使用独立文档。

Catalog 代码在 iframe 中执行，实际验证组件名及逐组件已解析属性；检查 on/watch 和后续回调动作是否有声明及实现（保留内建动作），Registry 缺失、组件和动作错误向工作台显示。结构、循环、文件边界在构建前校验；浏览器组件契约与交互另行验证，check 不宣称执行了真实产品行为。

固定桥接使用上游 markDevtoolsActive 启用生产 DOM 的 data-jr-key，不启用上游 Devtools 面板。designPart 暴露组件内子目标；说明和聊天附件引用 Spec key／子目标。重复实例通过 useRepeatScope.basePath 暴露实例地址，点选、定位和聊天附件区分具体行；Agent 仍修改共享的 Spec 定义，独立行设计差异需不同元素 ID 或场景数据。

## 状态与回写

Spec.state 与场景 state 构成初始状态，动作通过 json-render store 修改预览内存。Agent 更新 Spec props 时保留相同场景的 store，场景切换或重置才恢复初始状态。候选各有稳定 iframe 和 store，切换当前编辑方案不重排或重建画布。对比模式联动页面、场景、重置、视口与稳定标注目标，业务输入、任务、发布及 Agent 修改保持独立。页面切换由父工作台协调 prepare/commit/abort，双方 beforeNavigate 只检查保护，全部通过后 navigate 才清理已确认草稿和切页；任一取消则双方保留原页与输入。产品入口使用 usePreviewNavigation 返回的请求函数，简单 store 路由的页面写入也进入同一协调器。

父端验证消息来源窗口，预览验证 parent。manifest.controls 保留一级字面量属性的约束与受控保存接口，标准界面不预铺属性编辑器。统一 Agent 生成与校验修改后，使用完整源 revision 和控件值进行接受写回；控件绑定当前 Spec 字面量或候选已引用的数值 CSS 变量。外部冲突保留临时预览，不覆盖资源。

服务只监听 127.0.0.1，验证 Host、Origin 和随机令牌；令牌只在父页面，iframe 没有同源访问权限。端点不接受任意文件路径。

预览居中，Header 将需求标题、状态图标与无边框的“页面名 / 场景名”入口靠左连续排列，标题右侧紧接页面与场景，剩余空白位于导航与右侧工具之间。点击页面或场景名称选择；页面随实际导航更新，场景选项按当前页面筛选，交互后显示“当前交互状态”，选择预设场景才重新初始化。左侧设置保留需求／方案／视口，Header 右侧的说明／机器人图标 Agent／工具分别直接打开对应面板，再次点击收起，面板内部不重复 Tab。窄屏时页面与场景另起一行，右侧入口仅保留图标和可访问名称。抽屉定位在主画布内，自动避让完整 Header；桌面和手机均为非模态覆盖抽屉，不参与画布布局。开关不改变 iframe 的实际分辨率、缩放、位置或产品输入，关闭恢复对应 Header 入口的焦点。正常产品 Esc 不接管；点选模式才转发。

标题旁的状态图标区分本地、离线和提案，通过 Base UI Tooltip 在悬停、键盘聚焦或触屏点击时显示名称与能力说明。提案说明明确源文件尚未更新；状态入口在窄屏保留。状态浮层独立定位，不改变预览布局，Esc 优先关闭说明并保留已打开的辅助面板。

## 按需单文件导出

requirements/ 是本地设计产物的唯一维护来源。用户指定正式业务 PRD 时，按[来源与承接](../shared/references/product-source.md)记录设计所需摘要及来源；原有本地需求继续有效。exportHtml 直接使用当前本地需求、公共基础和插件构建 HTML，构建后核对资源 revision；该操作不写项目文件，不复制业务源码或保存归档。

工作台按钮 POST /__dh/export，服务验证 Host、Origin 与父端令牌，返回 text/html attachment；浏览器下载该文件，页面不询问版本号。导出期间阻止重复操作和实例属性编辑，废弃旧轮询重载；导出完成恢复编辑，预览输入保持不变。

CLI export <需求> --out <文件.html> 要求明确选择资源目录外的输出位置。解析父目录真实路径，拒绝写回资源树、目录或软链接；在目标旁写临时文件，再原子替换选定输出。构建失败不会覆盖原文件。重新生成同样走 export；工具不提供 release 版本、sources 副本、release.json、verify 或 rebuild 命令。

持续模式的 CLI export 可省略需求 ID，默认使用配置中的主稿；同一 --out 会更新同一 HTML。按需求模式要求明确 ID，浏览器下载当前打开的设计。所有模式继续从完整 Spec 构建，不直接维护导出 HTML。

离线 payload 无可用服务令牌；HTML 内嵌工作台、全部候选、图片、样式、说明和许可，可从 file:// 独立体验，不启动 Agent 或连接本地写回端点。源文件后续更新不改变已有导出，再次导出采用最新源。验收状态和必要结果保留于 handoff.md，历史用 Git 显式记录，导出不代表用户验收。

## 编号说明与 Agent

新说明显式选择 dimensions 模式，以操作、条件、状态、异常和流程五种固定三级标题组成可选维度。解析器将标题映射为有类型的阅读块，拒绝未知、重复或空维度；旧四种模式及未声明 view 时的 card 默认值保持兼容。InteractionReader 用统一标签与紧凑布局组合展示，状态支持短列表、流程支持有序步骤，异常有提示色；无导语时直接展示维度，不增加摘要或折叠层。协议与写作模板只维护在[交互说明协议](../shared/references/interactions.md)，本地与离线复用同一组件和样式。

独立 interactions/*.md 用 YAML 配置登记页面、id、target、条件与展示模式，Markdown 二级标题对应稳定 ID，三级标题组成阅读块；解析器拒绝重复 ID、未知模式、失效页面与目标。YAML 解析沿用 [yaml 官方 API](https://eemeli.org/yaml/)，禁止重复键和别名。正文经统一安全 Markdown 渲染。卡片、步骤、规则表、状态对照由工作台内置；同页按文档顺序稳定编号①②，运行状态只筛选可用条目。编号层不修改产品布局，随滚动、尺寸和弹层更新；点编号打开对应章节，点说明定位产品区域。点选捕获先于业务事件，读取具体 DOM、父级、样式和重复实例；点选时暂隐抽屉，选中一个元素立即退出并恢复业务操作，返回 Agent 保留附件。点选标签超长时以单行省略号显示，原生 title 提示保留全文，不能撑宽抽屉或挤出移除按钮。全局不再提供独立点选按钮。

点选复用 workbench/vendor/impeccable 中固定提交的 Apache-2.0 DOM 辅助模块；Agent 生命周期由插件适配 message／accept／discard／cancel，服务执行与存储遵循项目 Spec／React 边界，不复制上游整套 Live 服务。

Agent 在首次发送时启动长生命周期的 codex app-server stdio 连接，复用本机登录与模型 Provider 配置。每个工作台会话创建 ephemeral 原生 thread，消息调用 turn/start，并在每轮传入冻结的权限模式、model、effort、outputSchema 和当前临时目录；自动档由本机配置和模型目录解析。暂存目录位于系统临时位置，只包含业务设计上下文；工作台自身不执行业务工程构建脚本，Agent 命令按本轮原生权限执行。服务按专业身份限制写入：视觉只改当前候选和交接；交互还可修改当前需求的独立 Markdown 说明、场景与页面登记，其他候选只允许新增所需新页面 Spec。公共基础、依赖、运行器及其他候选的既有实现不可由聊天修改。依次做协议、类型、构建和隔离 Chrome 场景校验；共享变更检查所有候选。显示局部画面、完整提案预览、共享影响与文件前后内容；接受前比较完整源 revision，冲突保留预览。提案接受后写入，放弃／取消／关闭服务清理临时目录；完全访问或明确批准的越界操作已产生的直接修改不自动回滚。生成结果不等于保真或用户验收。

## 验证与平台边界

运行能力用合成示例验证，完整产品 UI 另按[保真规范](../shared/references/fidelity.md)核对真实指定基线，不用局部贯通或工程检查宣称整稿完成。验证临时截图和模型输出不保留为 evidence 目录。当前无云服务、多人编辑、在线发布或遥测；资源协议与工具边界为后续平台演进保留空间。

上游依据：[json-render Specs](https://json-render.dev/docs/specs)、[Registry](https://json-render.dev/docs/registry)、[React renderer](https://github.com/vercel-labs/json-render/tree/main/packages/react)、[esbuild API](https://esbuild.github.io/api/)。行为以锁定安装包和实际浏览器验证为准。

## 统一 Agent 与过程记录

Agent 将设计讨论和按需视觉调整合为同一会话。身份首次默认交互设计，其后恢复本机选择，并可切换交互或视觉设计；运行时从 workbench/agents 读取独立短身份入口，通过资料地图按需读取 shared 的公共方法与资源协议；对外阶段 Skill 继续独立编排授权、工作流和交付。每轮记录真实身份，切换身份保留同一会话上下文；待处理提案需先接受或放弃。message 可以只回答，也可返回 summary/files/controls；仅在明确视觉请求后按需提供0–4个真实有效控件。元素附件可选，发送时固定页面与 DOM 摘要。每轮先保存用户消息和一条处理中 Agent 消息，随后更新同一条消息的活动、回答和状态；界面展示完整当前会话历史，模型使用原生 thread 历史，不手工重复拼接对话；每轮补充权威资源路径、实际画面入口和前一提案状态，明确历史提案可能未被接受。服务重启清空，不向项目写会话文件。

Codex app-server JSON-RPC 通知流按 UTF-8 和行边界读取，按 item 归并公开 agentMessage 增量、reasoning summary、命令、目录、stdout/stderr、退出码及工具活动；仅 Provider 显式返回的推理摘要进入聊天，原始 reasoning 内容和最终源码 JSON 不进入。活动最多300项，单项文本／输出最多24000字符，输出在界面折叠展示。工具是否发生以实际事件为准，校验阶段由工作台在实际执行时记录。客户端轮询同一消息，显示 loading、实际耗时与取消；失败、取消、恢复上一版和接受结果同样保留。不会用编造的思考文本或百分比填充等待。

AgentPanel 使用独立、受面板高度约束的消息滚动区，输入区和待审批摘要位于滚动区外；已就绪提案拥有自己的可滚动内容区。上翻后关闭自动跟随，“回到最新”在消息区右下方出现；手动置底恢复跟随并将焦点交回消息区。ResizeObserver 跟踪消息内容及可视高度变化，补充流式文本、折叠详情与视口调整后的定位；切换会话重置为跟随最新，按钮不改变面板或产品画布尺寸。

use-agent 从当前候选的会话摘要及所选会话实际审批计算 approvalSessions，当前快照优先于可能迟到的列表状态。App 顶部 Agent 入口优先显示静态待审批标记；AgentPanel 固定展示当前请求数或后台待审批会话数，“查看审批”只选择会话并滚动、聚焦第一个未决卡片。定位只滚动消息区，不操作产品 iframe；审批结果、取消与原生撤销仍来自原协议，不新增批准途径。面板收起、用户上翻和其他会话正在讨论时保留提示，切换候选不混入其他候选的审批。

agent-runtime 的 timeoutMs 默认600000，表示连续无进展时限，不是整轮总时限。活动内容／状态变化、实际用量增长、新压缩完成与校验阶段推进会刷新计时；Provider 的无正文 onProgress 回调覆盖原生非空文本与命令输出增量，包括不公开的推理／最终结果和已达展示上限的输出。重复活动、仅 updatedAt 改变的用量快照与 HTTP 轮询不续期。存在任一 pendingApproval 时移除计时器，一直等待用户；最后一项批准、拒绝或撤销后重新给予完整时限。手动取消、原生撤销、断连和服务关闭仍按现有语义结束请求。

无进展超时先 abort 当前轮次，等待执行 Promise 返回及原生终端清理后才 failOrRecover，避免活动命令的目录提前消失；停止期间拒绝迟到审批和同会话新生成。取消细化也等待本轮退出后恢复上一版预览。终态或上一版预览恢复后收到的迟到进展／用量不得重启生成计时或清除30分钟预览过期计时。

contracts/markdown 提供前后端统一的同步安全 Markdown 渲染，复用锁定的 marked；交互说明与需求正文沿用该入口，frontend/ui/Markdown 在会话正文、公开过程说明和提案摘要中使用。聊天保留单次换行，支持 GFM 表格、嵌套列表、引用和代码；HTML 转义，图片只显示说明文字，链接仅允许 HTTP(S) 与稳定锚点。每处聊天内容使用独立锚点前缀，按原始内容缓存解析，增量文本和未闭合代码块可继续更新；服务消息仍保存原文，刷新后重新渲染。代码块保留缩进及语言标识，长代码和表格在自身区域横向滚动；命令、原始输出、审批详情和文件前后内容继续直接展示原文。Markdown 样式仅进入工作台，marked 许可随离线 HTML 内嵌。

调节只更新临时预览，accept 传值后重新验证并写入真实 Spec/params；baseJob 从暂存资源继续修改，保留先前代码与调节值。纯回答无需类型／构建；完全访问的直接副作用独立于返回提案。修改经过完整隔离校验，原资源 revision 变化拒绝接受。细化失败或取消本轮保留上一版预览，显式放弃清理整条待确认修改。切页、切会话、关闭面板和刷新不取消；接受后通过 GET /__dh/workspace 获取新 BundleData，局部更新画布与说明，保留会话和运行状态。

## 原生权限与审批

contracts/agent-permissions 定义三档产品权限。read-only 映射 readOnly，proposal 映射 workspaceWrite，full-access 映射 dangerFullAccess；前两档 approvalPolicy 为 on-request，完全访问为 never。审批 reviewer 显式选择 user，遵循本机管理约束，不修改 Codex 全局配置。proposal 显式指定本轮临时目录为可写根并排除共享 /tmp 和 TMPDIR 自动可写范围；每轮重新覆盖策略，不能沿用上轮完全访问。外部工具有独立权限控制，批准沙箱外操作后不能承诺无副作用。

权限仅在服务内按会话保存，刷新可恢复，新会话默认 proposal，不把完全访问保存为全局偏好。消息和 job 记录发送时模式。生成前记录完整副本指纹；模型轮次结束后先清理原生后台终端，校验前复制并核对指纹形成独立冻结副本；接受只使用冻结资源。后台终端清理失败时停用该会话。模型返回后检查实际目录与结构化结果，拒绝越界、删除、软链接及过大修改，然后沿用身份范围、类型、构建和浏览器校验。.agent-scratch/ 是不进入提案的命令输出目录。

原生 item/commandExecution/requestApproval、item/fileChange/requestApproval 和 item/permissions/requestApproval 按 threadId/turnId 对应当前 job；工作台使用独立审批标识，通过已有 POST /__dh/live/events 的 approval 事件答复，校验 sessionId、job、审批状态和选项。审批快照随消息保留；客户端仅提供批准本次、拒绝及取消，不写持久放行规则。权限扩展仅授予当前 turn。取消、原生 serverRequest/resolved、轮次结束和断连均清理未决请求，迟到响应不能批准旧请求。MCP elicitation 支持按 thread 归属的无 turnId 请求、HTTP(S)授权链接及含字符串、数值、布尔和单选字段的基本表单；字段约束由服务校验。不支持的复杂表单明确拒绝，其他未支持的原生客户端交互明确返回错误，不静默挂起或伪造完成。等待后台清理期间拒绝迟到审批。

命令审批待处理时保留完整卡片；批准、拒绝或取消后以单行命令和结果替代卡片，批准显示“命令已批准 ✅”，其他结果分别显示“命令已拒绝”或“命令已取消”。长命令省略显示并保留原生 `title` 全文，结果文字始终可见；此变化不删除消息中的完整审批快照。审批卡片和处理过程中的目录共用单行展示，按实际可用宽度保留路径头尾、中间使用 `...`，短路径完整显示，原生 `title` 保留完整目录；打开处理过程、调整窗口或面板宽度时重新计算。

完全访问模式在权限 Tab 显示可能在接受前修改源文件、放弃或取消不自动撤销的提示，模型入口保留解锁标记；历史消息保留该模式，独立提案也携带权限元数据。发现源 revision 在运行期间变化时记录事实，接受仍拒绝过期版本；不会将变化擅自归因于某个 Agent 或自动覆盖。文件冲突由用户协调。

## 多会话运行与扩展边界

services/agent-runtime 以工作台 sessionId 管理需求／候选归属、消息、模型设置、任务和提案。GET /__dh/live/sessions 列表、POST 同入口新建、GET /__dh/live/session 恢复快照；job、message、accept、discard、cancel、settings 都携带 sessionId 并校验归属。单会话从模型选择开始保留提交权，同一会话不能重叠 turn；不同会话、包括同一候选的会话可并发。类型检查使用可取消子进程，避免同步阻塞其他会话请求。

services/agent-providers 提供内部工厂，contracts/agent-provider 描述模型发现、原生会话创建、带 AbortSignal 的轮次执行、关闭和能力字段；本版只实现 Codex，不建立通用插件发现、Provider 切换 UI 或其他适配器。native threadId/turnId 留在适配器内部；共享进程按二者分发事件和结果，按 turn/interrupt 取消单轮，不能用杀共享进程取消某一会话。进程断开使所有活跃轮次失败、旧原生句柄失效，提示新建会话；工作台已校验就绪的提案仍可评审和接受。临时原生线程不承担跨服务重启恢复。

前端缓存以 sessionId 隔离，异步请求始终回到发起会话；会话列表展示后台状态。仅所选会话且 candidate/page 匹配时投影提案。sessionStorage 只记当前选中的会话标识，服务快照恢复消息、设置与任务；未发送草稿、参考图和未提交控件值在当前页面内存保存。待确认预览沿用30分钟过期清理。关闭服务中止所有活动轮次并清理暂存资源。

多会话共享实际设计源，用户协调冲突；不引入文件锁、自动合并或 worktree。接受时仍校验完整 requirement revision，另一个会话接受了其他候选或共享文件也可能使旧提案过期；拒绝写入且保留该提案供比较。生成与继续细化使用各自独立临时快照，后台完成不能替换其他会话的预览。

原生协议按本机 Codex 0.164.0 生成的 JSON Schema 及实际双线程、多轮调用验证；接入说明参见 [Codex App Server](https://learn.chatgpt.com/docs/app-server)。

## 画面与设计上下文

发送时从当前候选 iframe 取得实际 DOM 静态快照、控件当前值、滚动位置和可观察状态；去掉产品脚本和工作台覆盖层。在禁脚本、禁网络的隔离 iframe 中渲染为 PNG，通过 turn/start 的 localImage 输入附加给模型，不把初始场景重建当作用户现场。可同时附加3张用户参考图，每张最大3MB；临时图片随生成资源清理，不写入项目。

模型另收到当前需求、交接、完整交互文档、场景、页面登记、当前候选源码和公共基础。源码与文档在请求开始冻结，截图等待和继续细化不重新混入外部编辑；接受仍与实时源 revision 比较。Skill 文本属于插件方法，项目源码、文档、DOM、参考图与历史仅作为任务资料。

## 输入工具栏与本机模型

输入区使用统一边框包裹正文和底部单行工具栏，元素／参考图附件位于上方。点选、附件与发送／停止使用带可访问名称的图标；模型入口依次显示当前身份图标和模型名，设计身份通过同一弹层调整。交互设计使用流程节点、视觉设计使用调色盘；身份选项和入口共用对应图标，切换身份立即同步，入口图标带身份名称提示及可访问名称。窄屏只省略模型名，身份图标保持可见。模型按钮按名称、图标与内边距的自然宽度显示，不填满剩余空间；只有空间不足时收缩省略，并通过悬停显示身份／模型／推理强度／权限摘要。桌面、320/360px 和长模型名异步加载前后均不换行，不裁切其他入口，不改变产品预览尺寸。

ModelSettings 通过 Base UI Popover／Tabs 提供“模型、推理强度、权限、设计身份”四个 Tab；只有模型入口，选择即时保存并保持弹层与当前 Tab，切换 Tab 不提交业务设置。打开默认模型页；模型页复用 Select 的 inline Combobox 搜索列表，其他页复用同一内嵌列表，保留方向键高亮、Enter确认及禁用状态。保存期间只阻止重复选择，面板仍可切换；失败继续使用当前选择并提示重试。切换会话或开始生成关闭面板，Esc 仅关闭面板并恢复入口焦点。设计身份在待确认提案期间不可切换，其他设置沿用原有规则。完全访问在模型入口显示醒目的解锁标记，详细风险说明仅在权限 Tab 展示，输入区不重复提示。

模型图片能力通过 descriptionIcon 显示小图标，详细文案放在原生悬停提示与可访问名称中，列表不重复显示“支持图片”等文字；不支持图片的模型继续禁用。跟随本机配置的说明仍显示实际默认模型名称。

Agent 标题使用带下拉箭头的会话切换入口，列表保留会话名称、后台状态及选中标记；紧邻标题的＋图标新建会话，消息区不再单独放置会话栏。Provider 图标位于面板关闭按钮左侧，通过 Base UI Popover Portal 展开连接气泡，不移动消息区、输入区或产品预览。气泡支持外部点击和 Esc 关闭，Esc 恢复 Provider 入口焦点并保留 Agent 面板；窄屏避让窗口边缘，内容超高时内部滚动。

Codex Provider 气泡默认只展示来源与认证、当前模型、最近请求及四项用量（最近输入、最近输出、本轮文本、会话累计）。缓存输入、原生窗口、压缩次数和资料目录由“更多信息”折叠。刷新入口放标题右侧，检查时间放其悬停提示；省去重复模型名、常驻口径段落和次要分块计数。默认正常状态高度约300px，上限440px，标题与会话行固定、内容区滚动。

底部会话行展示工作台 sessionId，单行保留头尾，悬停看全文、复制取完整原值；切换会话关闭气泡并重置复制反馈及折叠状态。长模型名／来源单行省略，目录同样保留头尾并提供复制。百万级大数紧凑显示，title 和可访问名称保留精确计数；缺失值显示破折号，明确标为尚未取得。原生 threadId 继续留在适配器内部。

连接接口使用工作台令牌保护，仅通过 Codex app-server 的 initialize、config/read、account/read（refreshToken:false）和 model/list 读取本机元数据；该短生命周期进程不创建线程或推理，禁用 analytics。返回严格投影的 Provider 名称、认证方式、默认模型、模型图片能力及检查时间，不向浏览器提供完整配置、账户标识或凭据。模型目录可能来自缓存，不视为权限证明。状态缓存30秒、并发合并，打开 Agent 或用户刷新时读取；不后台轮询。

消息发送前解析模型并验证图片能力；默认跟随本机，显式选择仅覆盖本轮，兼容推理强度由同一模型目录确定，不写全局配置。真实推理开始、返回、失败或取消单独更新最近请求状态，后续设计校验失败不冒充 Provider 失败。每个会话的当前身份、模型及深度映射在服务会话中独立维护，每条历史记录实际模型、深度与来源。离线 HTML 不提供连接和模型调用。

## 本机偏好与思考深度

身份首次默认 interaction。客户端选择后通过令牌与 Origin 保护的 POST /__dh/live/settings 更新当前会话与本机偏好，未发送消息也保存。GET session 同时恢复当前会话设置；初始恢复完成前禁止发送，草稿可先输入。保存期间锁定选择和发送；失败保留本次选择并提示重试。新会话从本机偏好创建，已有会话保持自身设置，服务重启后按本机偏好创建新会话。

contracts/agent-settings 定义纯数据规则、默认值和深度名称；services/agent-settings 维护会话设置；adapters/agent-preferences 在 XDG_CONFIG_HOME/design-harness/agent-preferences.json（默认 ~/.config）保存 schemaVersion、identity、model 和 efforts。文件以0600权限原子替换，跨工作台进程通过短期文件锁合并局部更新；读取不创建文件，损坏时返回默认值和提示。偏好不参与设计资源 revision、导出或分发，不包含聊天、图像、凭据和业务资源。

思考深度由当前 model/list 的支持档位提供，按实际模型ID分别记忆，自动档解析本机配置及模型建议值。界面清除并提示失效记忆；服务在发送前独立拒绝不受支持的显式档位。解析后的实际深度冻结在本轮模型元数据中并传给原生 turn/start，切换模型或深度只影响后续请求，不修改历史记录或 Codex 配置。

## 通用选择组件

frontend/ui/Select.tsx 是工作台唯一选择入口，采用锁定版本的 @base-ui/react Select／Combobox，统一 options、value、onValueChange、disabled 和可选的搜索；按字段、紧凑工具栏或内嵌列表展示，选项可带图标、说明及禁用原因；descriptionIcon 可将能力说明变为带悬停提示的小图标。短列表使用 Select，搜索列表使用输入位于弹层内的 Combobox，默认六项起启用搜索，模型始终可搜索。选项标签、标识与辅助信息参与过滤。

业务值由调用功能控制；键盘与指针高亮不提交选择，Enter 或点击确认后才调用原业务回调。页面导航保护、候选联动及 Agent 偏好保存继续由原功能管理。Portal 浮层在抽屉之上定位、避让视窗并限制内部滚动，关闭恢复焦点，Esc 优先关闭浮层；手机增大选项触控区域。组件和依赖由插件打包，离线 HTML 内嵌相同交互与适用许可，无项目组件副本或网络加载。

上游交互依据：[Base UI Select](https://base-ui.com/react/components/select)、[Combobox 弹层搜索](https://base-ui.com/react/components/combobox#input-inside-popup)。

## 工作台滚动条

frontend/ui/scrollbars.css 仅从工作台前端入口加载，统一说明、聊天、输入框、代码／表格与 Portal 下拉列表。桌面采用透明轨道、灰紫滑块和悬停／拖动反馈；支持原生伪元素的浏览器使用 8px 轨道及圆角细滑块，其余使用标准 thin／scrollbar-color。保留原有 overflow、滚动容器和 gutter 规则，不使用 JavaScript 替换滚动或隐藏滑块；触控及系统强制配色使用浏览器默认样式。

该样式随工作台内嵌离线 HTML，但不进入候选预览文档，也不写入公共 foundation 或需求组件。产品滚动条继续由各自的设计样式决定。

## Agent 资料入口与用量观测

backend/adapters/agent-context 只构建有用途和读取条件的入口地图，不枚举整库文件或拼接正文；state.json、selection.json 与 resource-map.json 放本轮临时根的 context/，与可写 resources/ 分离，截图保留在临时根。agent-prompt 仅拼装短身份规则、当前组织与提案状态、地图、用户消息；当前截图由原生图片工具按需查看，用户参考图保持显式 localImage 输入。大文件保持完整，使用 rg 和分段读取，无预截断。

CLI 保留宿主路径，host-project 优先使用显式根；资源目录启动时使用当前 Git 工作树根，无 Git 时按标准 design-harness/ 边界确定。地图区分宿主项目、正式设计资源、正式需求、本轮 resources/ 与需求副本、插件根。设计源以本轮副本为准，宿主仅为相关调查依据，原生权限和提案校验保持适用；读取路径不会增加写入授权。

内部身份在 workbench/agents/，公共专业方法在 shared/references/，外部公开入口在 skills/。宿主 UI 操作与展示细节只在使用／维护文档，不进入内部身份、公共专业方法或默认地图。共享协议保持资源与 SDK 契约，宿主 UI 展示实现留在本文及使用手册。

Codex 的 thread/tokenUsage/updated 单独解析，接受没有 turnId 的线程用量通知，拒绝其他轮次的迟到通知；仅提取有效非负计数、last／total 与可选窗口，缺失字段保持缺失。contextCompaction 完成事件按 ID 去重。运行时按工作台会话保存观测，随 job 与 connection 返回；前端沿既有轮询更新 Provider 气泡，不写项目日志或遥测。累计总量不用于窗口占比，地图入口数量不代表真实文件读取审计。
