# Design Harness

<img src="assets/icon.png" width="80" height="80" alt="Design Harness 彩色组件图标">

面向本人和 Agent 的产品共创与本地设计插件。产品入口协助讨论需求、形成和维护 PRD；设计工作台由插件固定提供，项目维护业务设计资源。页面由 json-render Spec 组合，通过 Catalog／Registry 加载项目自定义 React 组件，可在工作台体验、比较和调整，按需导出可独立离线分享的单文件 HTML。

## 四个入口

| 入口 | 职责与停止点 |
| --- | --- |
| $design-harness-product | 共创产品问题、方案及取舍，形成可评审 PRD，并按评审意见维护业务结论 |
| $design-harness-init | 盘点真实依据，建立项目设计基础、Token、Catalog／Registry 和组件；交付基础后停止 |
| $design-harness-interaction | 建立独立需求、完整页面 Spec、说明及场景，验证用户任务；完成交互评审和交接后停止 |
| $design-harness-visual | 在同一 Spec 与组件上细化高保真、多尺寸和候选；完成视觉评审和交接后停止 |

四个入口显式调用，承接已有范围、授权与决定，不自动串联。产品共创支持有界面或无界面的需求，无需设计工作区；按用户模板和实际资料形成草稿，可保留待评审问题。飞书等文档使用环境已有工具，未连接时提供可复制草稿；评审后可根据提供的意见更新正式文档。

例如输入 `使用 $design-harness-product 和我讨论导入记录的重复处理规则，形成待评审 PRD`。需要维护正式文档时提供目标链接或创建位置；Skill 会按实际工具能力处理，无法完成的写入会明确说明。

设计阶段明确的小改直接完成，存在关键分歧时比较相应局部或代表候选；不固定生成套数，不逐页逐状态请求放行。

交互与视觉设计均在当前任务中完成获准的公共基础更新、验证和交接，按请求导出并验证离线 HTML，无需另启回写阶段；共同规则只维护在[设计维护与交接](shared/references/handoff.md)。工作台内置 Agent 按专业身份维护当前候选及获准的需求级共享资源，具体边界见[专业 Agent 协议](shared/references/agent.md)；公共基础由执行 Skill 的外部 Agent 按授权维护。

## 完整 UI 交付标准

完整 UI 按最高保真要求覆盖声明范围内的产品壳层、页面、控件、交互和状态。已有产品先取得指定版本、环境、路由及上下文下的实际基线；沿用区域逐区对照，新设计分别记录。

核对包括租户等上下文切换、用户菜单、分割线、准确图标、分页、固定输入区、滚动边界和响应式。产品行为可以本地模拟，界面与交互不能因此省略。模拟说明由评审工作台承载，避免改变产品构图。

视觉保真、实际操作路径、行为真实性和工程检查分别提供证据。构建、类型、检查数量与字节一致不代表完整 UI 或用户验收；未取得现网证据不声称生产一致。详见[交付保真](shared/references/fidelity.md)。

## 固定工作台与项目资源

- 插件 workbench/ 维护画布、抽屉、比较、构建、隔离预览、定位、保存及导出。
- 项目 foundation/ 沉淀公共组件、Catalog／Registry、Token、规则和资产。
- 所有需求共享项目唯一 foundation，每个候选保存独立完整 Spec、参数和专属实现。

```text
使用方项目/design-harness/
  project.json
  foundation/
  requirements/<需求>/
    manifest.json
    requirement.md
    interactions/*.md               独立交互说明与标注配置
    scenarios.json
    handoff.md
    candidates/<候选>/
      catalog.ts
      registry.tsx
      pages/<页面>.json               完整原生 Spec
      params.json
      components/
      assets/
  reviews/
```

项目不复制 studio/ 或工作台源码，不维护工具脚本、工具依赖和构建配置。React 负责组件内部外观与交互，Spec 负责页面组合和实例属性，Markdown 负责依据与说明。设计资源协议当前以本地文件为来源，为以后平台化保留边界；插件当前不提供云端设计资源协作服务。

公共基础应保持向下兼容，更新会影响已有需求；每次导出采用当前需求、公共基础与工作台，历史差异用 Git 记录。当前未发布，统一采用最新协议，不建设旧试跑的多版本兼容层。

## 本地体验

在完整插件目录安装锁定依赖后开发或启动工具：

```sh
npm ci
npm run check
npm run demo
```

demo 在 dist/centralized-demo/design-harness 生成合成数据局部示例，默认地址 http://127.0.0.1:4173。示例验证输入、进度、结果、下载和失败恢复，不证明任何真实产品的完整 UI 或服务行为。

从插件目录创建和加载项目资源（--project 也可直接指向资源目录）：

```sh
node workbench/cli.mjs init --project <项目> --example
node workbench/cli.mjs new <需求> --project <项目> --title <名称>
node workbench/cli.mjs serve --project <项目>
node workbench/cli.mjs check --project <项目>
node workbench/cli.mjs typecheck --project <项目>
node workbench/cli.mjs clone <需求> <原候选> <新候选> --project <项目>
node workbench/cli.mjs export <需求> --project <项目> --out <资源目录之外的文件.html>
```

各 Skill 直接引用同一个公共入口 node <插件目录>/workbench/cli.mjs；插件目录为当前 SKILL.md 所在目录向上两级。产品共创无需运行 CLI 或初始化设计工作区。阶段工作流和评价各自维护，业务模板、公共指导和许可集中在 shared/，随完整插件分发。项目无需 npm ci；工具依赖安装在插件，扩展业务依赖用 deps 命令安装到项目之外的缓存。

初始化拒绝覆盖已有 design-harness/。模板默认基础仍是草稿，应以项目真实规则替换。Figma、Pencil、截图与代码可作为输入，日常运行不依赖这些设计工具，也不导入业务工程模块。

## 预览、定位与 Agent

预览画布是主体，左右抽屉默认收起。顶部 Header 的“页面名 / 场景名”紧接需求标题右侧，点击名称切换选项，并随实际导航与交互状态更新；左侧预览设置保留需求、方案和视口。Header 右侧分别提供说明、机器人图标的 Agent 和工具入口，点击打开对应面板，再次点击收起，也可直接切换面板。窄屏时页面与场景另起一行，右侧入口只显示图标。桌面和手机均使用覆盖式抽屉，开关不改变实际预览分辨率、缩放、位置与输入，关闭保留预览和聊天草稿，支持 Esc 与对应入口的焦点恢复。

需求标题旁以图标表示本地草稿、离线预览或尚未写入的提案，悬停或键盘聚焦可查看状态含义与可用能力，触屏点击也可查看；Esc 优先关闭状态说明。

画面工具以 2×2 宫格展示标注开关、重置当前场景、方案对比和离线 HTML 导出，每项采用大图标与文字名称。标注与对比显示当前开关状态；离线预览保留导出入口并禁用，提示回到本地工作台重新导出。

项目代码在无同源权限的 sandbox iframe 中执行，通过受控消息交换 Spec、场景、定位和错误。交互说明以①②编号覆盖在画面上，点编号关联说明，点说明定位画面；复杂组件可用稳定子目标关联内部区域。点选记录实际 DOM、父层级、样式与重复实例，选中一个元素自动结束点选并恢复业务操作；点选入口只保留在 Agent 输入区。对比模式联动页面、场景、视口和标注目标，方案切换只改变编辑焦点，保留两侧位置与会话；业务输入、任务和 Live 修改仍独立。真实 iframe 尺寸决定响应式，缩放只用于摆放。

页面、标注和说明随实际导航与运行状态同步。工作台切页走真实导航和离开保护，取消离开保留原页；普通导航保留会话，选择预置场景或重置才初始化。每个需求用 interactions/*.md 独立编写说明，工作台内置卡片、步骤、规则表和状态对照；正文、页面和条件写在文档中，组件提供稳定目标与 SDK 接入。详见[交互说明协议](shared/references/interactions.md)。

工作台选择入口共用统一下拉：字段与图标工具栏两种外观，模型及长列表可搜索，选项支持说明和禁用原因；方向键只移动高亮，确认后才应用选择，Esc 先关闭下拉并恢复焦点。

输入框底部以图标工具栏收纳点选、参考图、身份、模型、思考深度与 Codex Provider 状态；模型默认跟随本机配置，可选择支持图片的模型，切换仅影响下一轮，历史保留实际模型。连接详情分开显示认证和最近请求结果，不把登录等同于调用成功。身份首次默认交互设计，新会话继承本机最近偏好，已有会话保留自身设置；身份、模型和每个模型的深度选完即记住，刷新及重启后恢复。同一 Agent 聊天可切换交互设计或视觉设计身份，消息保留专业身份并共享当前候选的已确认上下文。运行时读取现有 Skill，传入需求／交接／完整说明、场景、实际状态、当前 DOM 截图和可选参考图。支持多轮讨论、元素附件和视觉调整；明确提出修改要求后才生成预览及适用控件，初始不展示预设参数。使用本机 Codex 和当前候选会话，继续调整承接暂存方案及控件值，接受后才写入该候选 Spec／params／React／CSS。交互身份还可将需求说明、场景和页面登记纳入同一提案，展示共享影响范围并验证全部候选；新增页面可补齐其他候选的新 Spec，已有实现保持独立。完整提案在单独预览中评审全部页面和说明，接受统一写入。公共基础仍由单独授权维护。纯讨论不改文件；细化失败或取消本轮保留上一版预览，放弃或离开页面／候选清理整条待确认修改。

当前会话展示完整消息、回复和每轮真实处理活动，等待有 loading、耗时与取消。可公开的进展及校验结果进入记录；内部推理、原始命令／工具输出和源码 JSON 不作为聊天展示。会话仅在服务内存，关闭抽屉或接受后重载可恢复，服务重启清空，不向项目写日志。

候选级 CSS 参数独立保存在 params.json。图片和字体通过 ESM 导入并内嵌；图标与素材优先沿用真实项目规则并保留许可。使用 imagegen 时应保存实际结果并核对版面。

[资源协议](shared/references/protocol.md) · [操作与导出](shared/references/preview-export.md) · [交接](shared/references/handoff.md)

## 按需导出

导出的 HTML 内含工作台、产品脚本、样式、素材、说明及依赖许可，file:// 体验不需要插件或 HTTP/CDN。离线可阅读说明和点选元素，不运行 Agent 聊天、生成或本地写回。

requirements/ 是本地设计产物的唯一维护来源。用户指定飞书等正式业务 PRD 时，业务结论在该文档维护，本地需求记录设计所需的已确认摘要及来源；已有纯本地需求继续有效。来源变化、不可访问及离线边界见[业务 PRD 与设计承接](shared/references/product-source.md)。

工作台“导出离线 HTML”直接下载一个文件，不在项目创建 releases、源码副本、运行器或校验清单。CLI export 要求 --out 指定资源目录外的 .html 文件，可重新导出并替换该文件；资源出错时保留原输出。导出读取当前本地设计需求与公共基础，HTML 内嵌实际画面，不会随后续源文件编辑自动变化。

历史差异用 Git 显式记录；真实验收状态、选择理由、对照结论与未决项记录在需求 handoff.md，导出本身不代表验收。公共基础只按明确批准增量更新，不自动跨项目学习、后台晋升或遥测。

## 安装与分发

当前版本保持 0.2.0。源码变更不自动更新安装缓存，本地修改没有发布或推送到远端。

```sh
npm run package -- --out dist/build-<唯一名称>
```

生成完整插件 ZIP 和 SHA-256，拒绝覆盖。解压后通过 marketplace 根目录安装，运行前在完整插件目录 npm ci 安装固定依赖。四个 Skill、shared/ 和 workbench/ 一起分发；不包含项目知识、node_modules、dist、.harness 或 openspec。

开发源：固定工具在 workbench/，公共业务模板在 shared/workspace/，公共指导在 shared/references/，来源声明在 shared/third-party/。每份公共资源只维护一份，各 Skill 直接引用；项目只复制业务模板。Node.js 22+、ESM 与 npm 为工具运行环境。

工作台源码在 workbench/src/ 按 frontend、preview、backend、contracts 与 cli 分工，公开入口保持 workbench/cli.mjs。后端区分 HTTP、应用服务和外部能力适配；目录职责与依赖规则见[源码架构](docs/html-design.md#源码架构与依赖)。

## 维护与验证

npm run check 验证协议、隔离、候选、共享基础、按需导出、写回和分发；npm run typecheck 检查工具，typecheck --project 检查项目组件。npm run test:browser 使用真实 Chrome 验证输入、定位、Spec 写回、面板几何、候选与离线行为。

[Skill 维护](docs/skill-maintenance.md) · [验证范围](docs/validation.md) · [技术结构](docs/html-design.md) · [Agent 协作](docs/agent-workflow.md)

验证产生的截图和运行输出只用于当次检查，临时清理；项目不保留 evidence/，handoff 仅记录必要结论与未决项。

原创部分采用 [MIT](LICENSE)。保留已有 Impeccable、DESIGN.md、Lucide 和 UI/UX Pro Max 许可与署名。json-render 及实际运行依赖的许可随离线交付保留。Live 点选复用固定提交的 Impeccable DOM 辅助模块，插件实现面向 Spec／React 的生成、接受与放弃适配器，并未整体嵌入上游 Live 服务。
