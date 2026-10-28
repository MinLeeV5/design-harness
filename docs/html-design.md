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

`starter/`、`assets/`、`vendor/` 保留各自资源用途。项目 foundation、requirements、公开 CLI、预览 SDK 别名和离线 HTML 行为保持原协议。未来云端化可沿服务边界演进存储与执行接入，账号、协作、并发和云端任务仍需按实际需求设计。

架构边界由 [architecture.js](../scripts/architecture.js) 检查，并纳入 `npm run validate` 与插件打包；行为由类型检查、工作区测试和真实浏览器验证。

## 职责与协议

插件 [workbench/](../workbench/cli.mjs) 提供固定工具；项目只维护业务资源。加载器读取 project.json、需求清单、项目公共基础、候选 Catalog／Registry、完整原生 Spec、场景及说明，不执行项目构建配置。

[资源协议](../shared/references/protocol.md)与[加载校验](../workbench/src/backend/adapters/resource-store.mjs)一起维护。json-render 0.21.3 的 Spec 维护组合和实例属性，自定义 React 组件维护精确外观和复杂行为。Catalog 定义 Zod 属性与动作，Registry 提供实现；项目可扩展业务组件，无需改固定工作台。

项目只保留根目录 foundation 一份源码，需求和候选用 @design-harness/foundation/... 引用。公共更新影响已有需求，重建后的交付也采用最新基础，维护时检查向下兼容。各候选有独立 Spec、参数和专属实现；克隆复制全部候选文件。当前统一最新协议，不保留旧 studio 模式兼容层。

工具依赖固定在插件；可选业务 package.json 只声明精确版本的 dependencies，锁定到 dependencies.lock.json。deps 使用 --ignore-scripts 安装到用户缓存目录；deps 显式更新扩展锁；构建与重建使用项目当前匹配锁和外部缓存。项目不产生 node_modules 或工具配置。构建将 React/json-render/zod 固定到插件，避免重复 React 或业务覆盖引擎。

## 构建与隔离

esbuild 从各候选 registry 生成浏览器 IIFE，嵌入 CSS、图片与字体；实际解析文件只能位于该候选、项目公共基础、工具或依赖目录。其他候选和业务工程导入均拒绝；离线外部资源拒绝。

工具编译只引用自身和工具依赖，不加载业务 Registry 到父页面。项目代码只在 sandbox="allow-scripts allow-downloads" 的 iframe 中执行，没有 allow-same-origin。CSP 禁止网络连接与远程资源。该隔离用于本地可信设计资源，不承诺对恶意项目实施 CPU／内存资源限额。

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

离线 payload 无可用服务令牌；HTML 内嵌工作台、全部候选、图片、样式、说明和许可，可从 file:// 独立体验，不启动 Agent 或连接本地写回端点。源文件后续更新不改变已有导出，再次导出采用最新源。验收状态和必要结果保留于 handoff.md，历史用 Git 显式记录，导出不代表用户验收。

## 编号说明与 Agent

独立 interactions/*.md 用 YAML 配置登记页面、id、target、条件与展示模式，Markdown 二级标题对应稳定 ID，三级标题组成阅读块；解析器拒绝重复 ID、未知模式、失效页面与目标。YAML 解析沿用 [yaml 官方 API](https://eemeli.org/yaml/)，禁止重复键和别名。正文经统一安全 Markdown 渲染。卡片、步骤、规则表、状态对照由工作台内置；同页按文档顺序稳定编号①②，运行状态只筛选可用条目。编号层不修改产品布局，随滚动、尺寸和弹层更新；点编号打开对应章节，点说明定位产品区域。点选捕获先于业务事件，读取具体 DOM、父级、样式和重复实例；点选时暂隐抽屉，选中一个元素立即退出并恢复业务操作，返回 Agent 保留附件。全局不再提供独立点选按钮。

点选复用 workbench/vendor/impeccable 中固定提交的 Apache-2.0 DOM 辅助模块；Agent 生命周期由插件适配 message／accept／discard／cancel，服务执行与存储遵循项目 Spec／React 边界，不复制上游整套 Live 服务。

Agent 只在用户发送时启动 codex exec，复用本机登录与 Provider 配置，按本轮冻结的模型标识调用 --model；按所选支持档位调用 model_reasoning_effort；自动档由本机配置和模型目录解析，以 ephemeral、read-only 模式返回结构化文件修改。暂存目录位于系统临时位置，只包含业务设计上下文；不执行项目构建脚本。服务按专业身份限制写入：视觉只改当前候选和交接；交互还可修改当前需求的独立 Markdown 说明、场景与页面登记，其他候选只允许新增所需新页面 Spec。公共基础、依赖、运行器及其他候选的既有实现不可由聊天修改。依次做协议、类型、构建和隔离 Chrome 场景校验；共享变更检查所有候选。显示局部画面、完整提案预览、共享影响与文件前后内容；接受前比较完整源 revision，冲突保留预览。接受后写入，放弃／取消／关闭服务清理临时目录。生成结果不等于保真或用户验收。

## 验证与平台边界

运行能力用合成示例验证，完整产品 UI 另按[保真规范](../shared/references/fidelity.md)核对真实指定基线，不用局部贯通或工程检查宣称整稿完成。验证临时截图和模型输出不保留为 evidence 目录。当前无云服务、多人编辑、在线发布或遥测；资源协议与工具边界为后续平台演进保留空间。

上游依据：[json-render Specs](https://json-render.dev/docs/specs)、[Registry](https://json-render.dev/docs/registry)、[React renderer](https://github.com/vercel-labs/json-render/tree/main/packages/react)、[esbuild API](https://esbuild.github.io/api/)。行为以锁定安装包和实际浏览器验证为准。

## 统一 Agent 与过程记录

Agent 将设计讨论和按需视觉调整合为同一会话。身份首次默认交互设计，其后恢复本机选择，并可切换交互或视觉设计；运行时直接读取对应 Skill 入口、工作流、评价与 shared 公共指导，不维护第二份方法。每轮记录真实身份，切换身份保留同一候选上下文；待处理提案需先接受或放弃。message 可以只回答，也可返回 summary/files/controls；仅在明确视觉请求后按需提供0–4个真实有效控件。元素附件可选，发送时固定页面与 DOM 摘要。每轮先保存用户消息和一条处理中 Agent 消息，随后更新同一条消息的活动、回答和状态；界面展示完整当前候选历史，模型上下文取最近对话与当前资源。服务重启清空，不向项目写会话文件。

codex exec --json 的流按 UTF-8 和行边界读取，允许连接、turn、公开 agent_message 和粗粒度工具状态；内部 reasoning、命令／工具参数及输出、带源码的结构化结果和代码块不进入聊天。工具是否发生以实际事件为准，校验阶段由工作台在实际执行时记录。客户端轮询同一消息，显示 loading、实际耗时与取消；失败、取消、恢复上一版和接受结果同样保留。不会用编造的思考文本或百分比填充等待。

调节只更新临时预览，accept 传值后重新验证并写入真实 Spec/params；baseJob 从暂存资源继续修改，保留先前代码与调节值。纯回答无需类型／构建，无修改落盘；修改经过完整隔离校验，原资源 revision 变化拒绝接受。细化失败或取消本轮保留上一版预览，放弃／离开上下文清理整条待确认修改。接受后重载从当前服务恢复完整会话与处理记录。

## 画面与设计上下文

发送时从当前候选 iframe 取得实际 DOM 静态快照、控件当前值、滚动位置和可观察状态；去掉产品脚本和工作台覆盖层。在禁脚本、禁网络的隔离 iframe 中渲染为 PNG，通过 codex exec 的图片输入附加给模型，不把初始场景重建当作用户现场。可同时附加3张用户参考图，每张最大3MB；临时图片随生成资源清理，不写入项目。

模型另收到当前需求、交接、完整交互文档、场景、页面登记、当前候选源码和公共基础。源码与文档在请求开始冻结，截图等待和继续细化不重新混入外部编辑；接受仍与实时源 revision 比较。Skill 文本属于插件方法，项目源码、文档、DOM、参考图与历史仅作为任务资料。

## 输入工具栏与本机模型

输入区使用统一边框包裹正文和底部图标工具栏，元素／参考图附件位于上方。点选、附件、Provider 与发送／停止使用带可访问名称的图标；身份和模型保留短名称及完整提示。手机可换行，不改变产品预览尺寸。

连接接口使用工作台令牌保护，仅通过 Codex app-server 的 initialize、config/read、account/read（refreshToken:false）和 model/list 读取本机元数据；该短生命周期进程不创建线程或推理，禁用 analytics。返回严格投影的 Provider 名称、认证方式、默认模型、模型图片能力及检查时间，不向浏览器提供完整配置、账户标识或凭据。模型目录可能来自缓存，不视为权限证明。状态缓存30秒、并发合并，打开 Agent 或用户刷新时读取；不后台轮询。

消息发送前解析模型并验证图片能力；默认跟随本机，显式选择仅覆盖本轮，兼容推理强度由同一模型目录确定，不写全局配置。真实推理开始、返回、失败或取消单独更新最近请求状态，后续设计校验失败不冒充 Provider 失败。候选的当前身份、模型及深度映射在服务会话中独立维护，每条历史记录实际模型、深度与来源。离线 HTML 不提供连接和模型调用。

## 本机偏好与思考深度

身份首次默认 interaction。客户端选择后通过令牌与 Origin 保护的 POST /__dh/live/settings 更新当前会话与本机偏好，未发送消息也保存。GET session 同时恢复当前会话设置；初始恢复完成前禁止发送，草稿可先输入。保存期间锁定选择和发送；失败保留本次选择并提示重试。新会话从本机偏好创建，已有会话保持自身设置，服务重启后按本机偏好创建新会话。

contracts/agent-settings 定义纯数据规则、默认值和深度名称；services/agent-settings 维护会话设置；adapters/agent-preferences 在 XDG_CONFIG_HOME/design-harness/agent-preferences.json（默认 ~/.config）保存 schemaVersion、identity、model 和 efforts。文件以0600权限原子替换，跨工作台进程通过短期文件锁合并局部更新；读取不创建文件，损坏时返回默认值和提示。偏好不参与设计资源 revision、导出或分发，不包含聊天、图像、凭据和业务资源。

思考深度由当前 model/list 的支持档位提供，按实际模型ID分别记忆，自动档解析本机配置及模型建议值。界面清除并提示失效记忆；服务在发送前独立拒绝不受支持的显式档位。解析后的实际深度冻结在本轮模型元数据中并传给 codex exec，切换模型或深度只影响后续请求，不修改历史记录或 Codex 配置。

## 通用选择组件

frontend/ui/Select.tsx 是工作台唯一选择入口，采用锁定版本的 @base-ui/react Select／Combobox，统一 options、value、onValueChange、disabled 和可选的搜索；按字段或紧凑工具栏展示，选项可带图标、说明及禁用原因。短列表使用 Select，搜索列表使用输入位于弹层内的 Combobox，默认六项起启用搜索，模型始终可搜索。选项标签、标识与辅助信息参与过滤。

业务值由调用功能控制；键盘与指针高亮不提交选择，Enter 或点击确认后才调用原业务回调。页面导航保护、候选联动及 Agent 偏好保存继续由原功能管理。Portal 浮层在抽屉之上定位、避让视窗并限制内部滚动，关闭恢复焦点，Esc 优先关闭浮层；手机增大选项触控区域。组件和依赖由插件打包，离线 HTML 内嵌相同交互与适用许可，无项目组件副本或网络加载。

上游交互依据：[Base UI Select](https://base-ui.com/react/components/select)、[Combobox 弹层搜索](https://base-ui.com/react/components/combobox#input-inside-popup)。

## 工作台滚动条

frontend/ui/scrollbars.css 仅从工作台前端入口加载，统一说明、聊天、输入框、代码／表格与 Portal 下拉列表。桌面采用透明轨道、灰紫滑块和悬停／拖动反馈；支持原生伪元素的浏览器使用 8px 轨道及圆角细滑块，其余使用标准 thin／scrollbar-color。保留原有 overflow、滚动容器和 gutter 规则，不使用 JavaScript 替换滚动或隐藏滑块；触控及系统强制配色使用浏览器默认样式。

该样式随工作台内嵌离线 HTML，但不进入候选预览文档，也不写入公共 foundation 或需求组件。产品滚动条继续由各自的设计样式决定。
