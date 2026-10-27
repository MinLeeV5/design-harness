# 固定工作台与资源渲染

## 职责与协议

插件 [workbench/](../workbench/cli.mjs) 提供固定工具；项目只维护业务资源。加载器读取 project.json、需求清单、项目公共基础、候选 Catalog／Registry、完整原生 Spec、场景及说明，不执行项目构建配置。

[资源协议](../skills/design-harness-init/references/protocol.md)与[加载校验](../workbench/lib/protocol.mjs)一起维护。json-render 0.21.3 的 Spec 维护组合和实例属性，自定义 React 组件维护精确外观和复杂行为。Catalog 定义 Zod 属性与动作，Registry 提供实现；项目可扩展业务组件，无需改固定工作台。

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

预览居中，紧凑标题栏保留左右抽屉入口。左侧是页面／场景／方案／视口，右侧是说明／统一 Agent／工具。桌面和手机的非模态覆盖抽屉均不参与画布布局。开关不改变 iframe 的实际分辨率、缩放、位置或产品输入，关闭恢复入口焦点。正常产品 Esc 不接管；点选模式才转发。

## 按需单文件导出

requirements/ 是唯一需求来源。exportHtml 直接使用当前需求、公共基础和插件构建 HTML，构建后核对资源 revision；该操作不写项目文件，不复制业务源码或保存归档。

工作台按钮 POST /__dh/export，服务验证 Host、Origin 与父端令牌，返回 text/html attachment；浏览器下载该文件，页面不询问版本号。导出期间阻止重复操作和实例属性编辑，废弃旧轮询重载；导出完成恢复编辑，预览输入保持不变。

CLI export <需求> --out <文件.html> 要求明确选择资源目录外的输出位置。解析父目录真实路径，拒绝写回资源树、目录或软链接；在目标旁写临时文件，再原子替换选定输出。构建失败不会覆盖原文件。重新生成同样走 export；工具不提供 release 版本、sources 副本、release.json、verify 或 rebuild 命令。

离线 payload 无可用服务令牌；HTML 内嵌工作台、全部候选、图片、样式、说明和许可，可从 file:// 独立体验，不启动 Agent 或连接本地写回端点。源文件后续更新不改变已有导出，再次导出采用最新源。验收状态和必要结果保留于 handoff.md，历史用 Git 显式记录，导出不代表用户验收。

## 编号说明与 Agent

独立 interactions/*.md 用 YAML 配置登记页面、id、target、条件与展示模式，Markdown 二级标题对应稳定 ID，三级标题组成阅读块；解析器拒绝重复 ID、未知模式、失效页面与目标。YAML 解析沿用 [yaml 官方 API](https://eemeli.org/yaml/)，禁止重复键和别名。正文经统一安全 Markdown 渲染。卡片、步骤、规则表、状态对照由工作台内置；同页按文档顺序稳定编号①②，运行状态只筛选可用条目。编号层不修改产品布局，随滚动、尺寸和弹层更新；点编号打开对应章节，点说明定位产品区域。点选捕获先于业务事件，读取具体 DOM、父级、样式和重复实例；点选时暂隐抽屉，选中一个元素立即退出并恢复业务操作，返回 Agent 保留附件。全局不再提供独立点选按钮。

点选复用 workbench/vendor/impeccable 中固定提交的 Apache-2.0 DOM 辅助模块；Agent 生命周期由插件适配 message／accept／discard／cancel，服务执行与存储遵循项目 Spec／React 边界，不复制上游整套 Live 服务。

Agent 只在用户发送时启动 codex exec，复用本机登录和模型配置，以 ephemeral、read-only 模式返回结构化文件修改。暂存目录位于系统临时位置，只包含业务设计上下文；不执行项目构建脚本。服务限制写入当前候选，依次做协议、类型、构建和隔离 Chrome 场景校验，再显示预览与文件内容；接受前比较完整源 revision，冲突保留预览。接受后写入，放弃／取消／关闭服务清理临时目录。生成结果不等于保真或用户验收。

## 验证与平台边界

运行能力用合成示例验证，完整产品 UI 另按[保真规范](../skills/design-harness-init/references/fidelity.md)核对真实指定基线，不用局部贯通或工程检查宣称整稿完成。验证临时截图和模型输出不保留为 evidence 目录。当前无云服务、多人编辑、在线发布或遥测；资源协议与工具边界为后续平台演进保留空间。

上游依据：[json-render Specs](https://json-render.dev/docs/specs)、[Registry](https://json-render.dev/docs/registry)、[React renderer](https://github.com/vercel-labs/json-render/tree/main/packages/react)、[esbuild API](https://esbuild.github.io/api/)。行为以锁定安装包和实际浏览器验证为准。

## 统一 Agent 与过程记录

Agent 将设计讨论和按需视觉调整合为同一会话。message 可以只回答，也可返回 summary/files/controls；仅在明确视觉请求后按需提供0–4个真实有效控件。元素附件可选，发送时固定页面与 DOM 摘要。每轮先保存用户消息和一条处理中 Agent 消息，随后更新同一条消息的活动、回答和状态；界面展示完整当前候选历史，模型上下文取最近对话与当前资源。服务重启清空，不向项目写会话文件。

codex exec --json 的流按 UTF-8 和行边界读取，允许连接、turn、公开 agent_message 和粗粒度工具状态；内部 reasoning、命令／工具参数及输出、带源码的结构化结果和代码块不进入聊天。工具是否发生以实际事件为准，校验阶段由工作台在实际执行时记录。客户端轮询同一消息，显示 loading、实际耗时与取消；失败、取消、恢复上一版和接受结果同样保留。不会用编造的思考文本或百分比填充等待。

调节只更新临时预览，accept 传值后重新验证并写入真实 Spec/params；baseJob 从暂存资源继续修改，保留先前代码与调节值。纯回答无需类型／构建，无修改落盘；修改经过完整隔离校验，原资源 revision 变化拒绝接受。细化失败或取消本轮保留上一版预览，放弃／离开上下文清理整条待确认修改。接受后重载从当前服务恢复完整会话与处理记录。
