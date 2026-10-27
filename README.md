# Design Harness

<img src="assets/icon.png" width="80" height="80" alt="Design Harness 彩色组件图标">

面向本人和 Agent 的本地设计插件。插件固定提供评审工作台，项目维护业务设计资源；页面由 json-render Spec 组合，通过 Catalog／Registry 加载项目自定义 React 组件。在同一工作台体验、比较、定位和调整，按需导出可独立离线分享的单文件 HTML。

## 三个入口

| 入口 | 职责与停止点 |
| --- | --- |
| $design-harness-init | 盘点真实依据，建立项目设计基础、Token、Catalog／Registry 和组件；交付基础后停止 |
| $design-harness-interaction | 建立独立需求、完整页面 Spec、说明及场景，验证用户任务；完成交互评审和交接后停止 |
| $design-harness-visual | 在同一 Spec 与组件上细化高保真、多尺寸和候选；完成视觉评审和交接后停止 |

三入口显式调用，承接已有范围、授权与决定，不自动串联。明确的小改直接完成，存在关键分歧时比较相应局部或代表候选；不固定生成套数，不逐页逐状态请求放行。

交互与视觉设计均在当前任务中完成获准的公共基础更新、验证和交接，按请求导出并验证离线 HTML，无需另启回写阶段；共同规则只维护在[设计维护与交接](shared/references/handoff.md)。工作台内置 Agent 仅写当前候选，公共基础及需求文档由执行 Skill 的外部 Agent 按授权维护。

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

项目不复制 studio/ 或工作台源码，不维护工具脚本、工具依赖和构建配置。React 负责组件内部外观与交互，Spec 负责页面组合和实例属性，Markdown 负责依据与说明。资源协议当前以本地文件为来源，为以后平台化保留边界；当前没有云端协作服务。

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

三个 Skill 直接引用同一个公共入口 node <插件目录>/workbench/cli.mjs；插件目录为当前 SKILL.md 所在目录向上两级。阶段工作流和评价各自维护，业务模板、公共指导和许可集中在 shared/，随完整插件分发。项目无需 npm ci；工具依赖安装在插件，扩展业务依赖用 deps 命令安装到项目之外的缓存。

初始化拒绝覆盖已有 design-harness/。模板默认基础仍是草稿，应以项目真实规则替换。Figma、Pencil、截图与代码可作为输入，日常运行不依赖这些设计工具，也不导入业务工程模块。

## 预览、定位与 Agent

预览画布是主体，左右抽屉默认收起。左侧放页面、场景、方案和视口，右侧放交互说明、统一 Agent 和画面工具；顶部只保留简洁标题。桌面和手机均使用覆盖式抽屉，开关不改变实际预览分辨率、缩放、位置与输入，关闭保留预览和聊天草稿，支持 Esc 与入口焦点恢复。

项目代码在无同源权限的 sandbox iframe 中执行，通过受控消息交换 Spec、场景、定位和错误。交互说明以①②编号覆盖在画面上，点编号关联说明，点说明定位画面；复杂组件可用稳定子目标关联内部区域。点选记录实际 DOM、父层级、样式与重复实例，选中一个元素自动结束点选并恢复业务操作；点选入口只保留在 Agent 输入区。对比模式联动页面、场景、视口和标注目标，方案切换只改变编辑焦点，保留两侧位置与会话；业务输入、任务和 Live 修改仍独立。真实 iframe 尺寸决定响应式，缩放只用于摆放。

页面、标注和说明随实际导航与运行状态同步。工作台切页走真实导航和离开保护，取消离开保留原页；普通导航保留会话，选择预置场景或重置才初始化。每个需求用 interactions/*.md 独立编写说明，工作台内置卡片、步骤、规则表和状态对照；正文、页面和条件写在文档中，组件提供稳定目标与 SDK 接入。详见[交互说明协议](shared/references/interactions.md)。

Agent 统一支持多轮讨论、元素附件和视觉调整；明确提出修改要求后才生成预览及适用控件，初始不展示预设参数。使用本机 Codex 和当前候选会话，继续调整承接暂存方案及控件值，接受后才写入该候选 Spec／params／React／CSS。纯讨论不改文件；细化失败或取消本轮保留上一版预览，放弃或离开页面／候选清理整条待确认修改。

当前会话展示完整消息、回复和每轮真实处理活动，等待有 loading、耗时与取消。可公开的进展及校验结果进入记录；内部推理、原始命令／工具输出和源码 JSON 不作为聊天展示。会话仅在服务内存，关闭抽屉或接受后重载可恢复，服务重启清空，不向项目写日志。

候选级 CSS 参数独立保存在 params.json。图片和字体通过 ESM 导入并内嵌；图标与素材优先沿用真实项目规则并保留许可。使用 imagegen 时应保存实际结果并核对版面。

[资源协议](shared/references/protocol.md) · [操作与导出](shared/references/preview-export.md) · [交接](shared/references/handoff.md)

## 按需导出

导出的 HTML 内含工作台、产品脚本、样式、素材、说明及依赖许可，file:// 体验不需要插件或 HTTP/CDN。离线可阅读说明和点选元素，不运行 Agent 聊天、生成或本地写回。

requirements/ 是唯一需求来源。工作台“导出离线 HTML”直接下载一个文件，不在项目创建 releases、源码副本、运行器或校验清单。CLI export 要求 --out 指定资源目录外的 .html 文件，可重新导出并替换该文件；资源出错时保留原输出。导出读取当前需求与公共基础，HTML 内嵌实际画面，不会随后续源文件编辑自动变化。

历史差异用 Git 显式记录；真实验收状态、选择理由、对照结论与未决项记录在需求 handoff.md，导出本身不代表验收。公共基础只按明确批准增量更新，不自动跨项目学习、后台晋升或遥测。

## 安装与分发

当前版本保持 0.2.0。源码变更不自动更新安装缓存，本地修改没有发布或推送到远端。

```sh
npm run package -- --out dist/build-<唯一名称>
```

生成完整插件 ZIP 和 SHA-256，拒绝覆盖。解压后通过 marketplace 根目录安装，运行前在完整插件目录 npm ci 安装固定依赖。三个 Skill、shared/ 和 workbench/ 一起分发；不包含项目知识、node_modules、dist、.harness 或 openspec。

开发源：固定工具在 workbench/，公共业务模板在 shared/workspace/，公共指导在 shared/references/，来源声明在 shared/third-party/。每份公共资源只维护一份，各 Skill 直接引用；项目只复制业务模板。Node.js 22+、ESM 与 npm 为工具运行环境。

## 维护与验证

npm run check 验证协议、隔离、候选、共享基础、按需导出、写回和分发；npm run typecheck 检查工具，typecheck --project 检查项目组件。npm run test:browser 使用真实 Chrome 验证输入、定位、Spec 写回、面板几何、候选与离线行为。

[Skill 维护](docs/skill-maintenance.md) · [验证范围](docs/validation.md) · [技术结构](docs/html-design.md) · [Agent 协作](docs/agent-workflow.md)

验证产生的截图和运行输出只用于当次检查，临时清理；项目不保留 evidence/，handoff 仅记录必要结论与未决项。

原创部分采用 [MIT](LICENSE)。保留已有 Impeccable、DESIGN.md、Lucide 和 UI/UX Pro Max 许可与署名。json-render 及实际运行依赖的许可随离线交付保留。Live 点选复用固定提交的 Impeccable DOM 辅助模块，插件实现面向 Spec／React 的生成、接受与放弃适配器，并未整体嵌入上游 Live 服务。
