# Design Harness

<img src="assets/icon.png" width="80" height="80" alt="Design Harness 彩色组件图标">

面向本人与 Agent 的本地设计插件。以项目设计基础和独立需求为核心，用 React 制作可运行的 PRD、UX、UI 交付；在同一份产物中评审、比较和调整，导出可离线分享的固定 HTML。

## 四个入口

| 入口 | 职责与停止点 |
| --- | --- |
| $design-harness-init | 盘点项目上下文与设计依据，建立本地设计基础、Token、组件和资源；交付基础后停止 |
| $design-harness-interaction | 为独立需求建立说明、场景和可运行流程，验证完整用户任务；完成交互评审后停止 |
| $design-harness-visual | 在同一 React 产物中细化高保真和多尺寸，按需比较候选、点选与调参；完成视觉评审后停止 |
| $design-harness-writeback | 按批准增量更新公共基础，按请求导出固定交付；核验结果后停止 |

四个入口保持显式调用，不自动串联。任务已有的范围、授权和决定直接承接；关键变化才重新对齐。
交互和视觉共用页面源码。明确的小改直接执行；方向存在分歧时才比较有意义的局部或代表候选，不固定生成套数。
评审围绕用户任务与实际画面进行，范围内的页面、状态、检查和修复连续完成，不固定逐页逐状态请求放行。

## 统一 React 模板

模板包含三层：

- 插件维护统一评审工作台：需求说明、页面/场景/尺寸切换、候选比较、点选定位、即时调参与导出。
- Init 沉淀项目设计基础：意图、规则、Token、可运行组件、布局模式及资源。
- 每个需求维护自己的说明、React 页面、场景、候选、交接与基础快照。

工作台以满幅预览画布为主体。交互说明、Live 和反馈默认收起，点击画布右侧的悬浮工具按钮打开覆盖式抽屉，再次点击可收起；小屏使用底部浮层。
悬浮入口和抽屉均不参与画布布局，开关面板不会改变预览的实际分辨率、缩放或位置。
关闭面板保留未保存调参、反馈草稿和预览操作状态，可用关闭按钮或 Esc 退出。
工作台和产品预览隔离样式。真实 iframe 宽高决定响应式布局，缩放只用于工作台摆放。
React 是 UI 的唯一实现来源；Markdown/JSON 管理说明、页面索引、场景和关联信息，不生成第二份 JSON UI 树。
设计产物以交付参考为目的，独立于业务工程的组件、路由、构建和后端。

    使用方项目/
      design-harness/
        workspace.json
        package.json
        package-lock.json
        foundation/                   公共设计基础
        studio/                       固定工作台与运行工具
        requirements/<需求ID>/
          manifest.json
          requirement.md
          scenarios.json
          handoff.md
          foundation/                 当前需求固定基础
          src/pages/
          src/components/
          candidates/
          assets/
        releases/<需求ID>/v1/
          index.html                  单文件离线交付
          sources/                    固定源码与依赖清单
          release.json                SHA-256 清单

需求创建时复制公共基础。公共更新只影响新需求，显式升级创建新需求版本；已有固定交付不覆盖。
Figma、Pencil、截图和当前代码可以作为用户指定的输入，日常运行不依赖 Figma。

## 本地体验

开发本插件：

    npm ci
    npm run check
    npm run demo

demo 在 dist/demo/design-harness 建立通用资料整理示例，默认服务地址为 http://127.0.0.1:4173。
示例演示输入校验、运行反馈、结果与材料预览、失败恢复，数据完全合成。它不证明真实 Agent 或后端行为。

在已授权的使用方项目建立工作区：

    node <任一Skill目录>/scripts/harness.mjs init --project <项目目录>
    npm --prefix <项目目录>/design-harness ci

增加 --example 可同时生成通用示例。初始化拒绝覆盖已有目录；现有工作区先读真实内容。
随后在设计工作区运行：

    npm run new -- <需求ID> --title <需求名称>
    npm run dev
    npm run check
    npm run typecheck
    npm run export -- <需求ID> v1
    npm run verify -- releases/<需求ID>/v1

新需求的示例内容需要按本次目标替换。Init 根据已有规范修订公共基础，不把模板默认值当作项目已确认设计。
项目已有前端框架也不会被导入设计运行工程。每个 Skill 携带完整模板，可单独复制使用。

## 说明、场景与 Live

requirement.md 保存 PRD、行为规则和验收条件，标题通过稳定锚点与界面关联。
scenarios.json 保存初始状态及说明目标；React 页面通过 data-dh-id 提供定位。
点选界面可关联说明，复制包含需求、页面、场景、候选、视口和目标的反馈给 Agent。

两候选比较采用相同初始场景和真实视口，交互各自运行。
已登记的 CSS 变量可拖动即时调整；显式保存写回当前候选 JSON，内容哈希冲突时拒绝覆盖。
任意布局、业务交互和文案由 Agent 修改 React 源码，保存后自动重载。未保存调参会暂缓自动重载。
当前提供原创的最小 Live 能力，不包含 Impeccable 引擎，也不支持任意 DOM 到 TSX 的反向编辑。

图标和图片沿用项目规则。需要情境生图时调用环境提供的 imagegen Skill/工具，保存到需求资产并检查实际版面。
图片和字体通过 ESM 导入，导出时内嵌；外部链接仍可作为阅读来源。

[协议](skills/design-harness-init/references/protocol.md) · [预览与导出](skills/design-harness-init/references/preview-export.md) · [交接](skills/design-harness-init/references/handoff.md)

## 固定交付

index.html 包含脚本、样式、图片/字体及说明，可独立离线打开；不连接本地写入服务。
导出同时保存需求、固定基础、模板源码、依赖清单与锁文件。HTML 已含运行依赖，源码重建需要按锁文件安装依赖。
release.json 保存文件 SHA-256，verify 检查实际字节及未登记文件。已有版本拒绝覆盖，新修改导出新版本。

导出成功不表示用户验收；真实确认、选择理由、验证和未决项保存在需求 handoff.md。
公共基础只接受明确批准的增量，不自动跨项目学习或后台晋升知识。
本版不提供在线评论、多人编辑、部署或发布服务。

## 安装与团队分发

当前本地开发版本为 0.2.0。源码修改不会自动更新已安装插件；新能力需本地包安装或后续发布才会生效。
GitHub 安装跟随明确 Git 引用；本轮本地变更未发布到远端：

    codex plugin marketplace add MinLeeV5/design-harness --ref main
    codex plugin add design-harness@design-harness

本地打包：

    npm run package -- --out dist/build-<唯一名称>

输出 ZIP 与 SHA-256，拒绝覆盖已有包。解压后使用 marketplace 根目录：

    codex plugin marketplace add /path/to/design-harness
    codex plugin add design-harness@design-harness

分发只携带通用模板、方法和许可，不包含真实项目知识、路径或任务记录。
Skill 运行模板与资源各自携带，不依赖插件根目录或兄弟 Skill。
开发工具统一 Node.js 22+、ESM 和 npm；设计工作区自行安装锁定依赖，不需要全局安装运行助手。

## 维护与验证

模板开发源位于 Init 的 assets/workspace。修改后运行 npm run sync:runtime，同步四个独立入口；npm run validate 检查完整性和字节一致。
npm run check 覆盖结构、独立复制、协议、构建、来源隔离、候选写回、固定版本和打包。
浏览器验证使用 npm run test:browser，需要本机 Chrome；覆盖实际输入、状态、调参写回、多尺寸与离线体验。
脚本不能证明设计质量、用户批准或真实业务服务行为。

[Skill 维护](docs/skill-maintenance.md) · [验证范围](docs/validation.md) · [技术结构](docs/html-design.md) · [Agent 协作](docs/agent-workflow.md)

原创部分采用 [MIT](LICENSE)。保留已有 Impeccable、DESIGN.md、Lucide 和 UI/UX Pro Max 的许可与署名。
新 Live 与模板为原创实现，方法与素材授权分别处理。实际运行依赖的许可随固定交付保留。
