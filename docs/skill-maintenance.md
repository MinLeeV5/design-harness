# Skill 维护指南

## 设计流程与知识

四个入口显式启动，交互和视觉共同编辑同一 json-render Spec 与 React 组件产物。维护流程时读取实际影响阶段的 references/workflow.md、evaluation.md。
不恢复固定逐页逐状态审批，不强制小修改探索多套候选。范围内直接落实明确改动；关键业务行为或交付边界变化才重新对齐。
验证输出临时清理，不在项目和分发中维护 evidence；必要结论和未决项记入 handoff.md。真实决定、反馈与实际变化记入需求 handoff.md，工具成功和导出版本不等于验收。公共回写仅批准增量。

使用方设计知识与唯一需求来源保存在仓库 design-harness/；HTML 按需下载或导出到资源目录之外，历史用 Git 记录。项目规范和真实代码用于建立当前事实；已确认未来设计单独表达。
协议、稳定定位和恢复方式见 [协议](../skills/design-harness-init/references/protocol.md)、[交接](../skills/design-harness-init/references/handoff.md)。
模板默认值保持草稿身份，通用分发包不包含真实项目标识、路径或任务记录。

维护完整 UI 标准时遵循[交付保真](../skills/design-harness-init/references/fidelity.md)：先明确范围与实际基线，检查产品壳层及沿用组件，分别提供视觉、交互、行为与工程证据。各阶段评价按职责维护，不使用同一份笼统评价代替阶段证据。
该指导四入口自包含同步；模板只演示局部流程，不隐含真实品牌、完整产品壳层或现网一致结论。新增规则保持来源通用，不写入试点的真实标识或路径。

## Skill 结构与运行

每个 Skill 自包含指导、agents、references、轻量 scripts、业务 assets 和适用许可；Markdown 引用不越界。运行能力依赖完整插件的固定 workbench/ 工具，启动器定位同一工具，不依赖兄弟 Skill。
公共基础仅在项目根目录保留一份，所有需求与导出共享，兼容更新需验证已有需求。requirements 为唯一维护来源，不创建 releases 或业务源码副本；重新生成统一使用 export。
四个入口携带相同的业务资源模板、启动器与资源/协议/预览/交接指导，不分发四套工作台。
workbench/ 是唯一工具开发源；Init 的 assets/workspace 是业务模板开发源；修改后运行 npm run sync:runtime。分发校验要求所有副本一致，禁止依赖源码软链接。
各阶段独立维护工作流和评价，只有 Init/视觉携带资产方法，其余阶段不引入生图流程。

固定工具使用 Node.js 22+、json-render、React、TypeScript 与 esbuild，工具依赖和锁文件位于插件。项目只维护 Spec、Catalog／Registry、业务组件和可选扩展依赖声明；扩展缓存位于项目之外。
交互正文与关联配置由各需求 interactions/*.md 统一维护，场景仅保存初始数据；[交互协议](../skills/design-harness-init/references/interactions.md)约定文档、展示模式与导航 SDK。对比共享页面/场景/视口/标注上下文，编辑焦点不影响两侧会话；离开保护先分别确认再统一切页，输入及业务/Agent 修改保持方案独立。
预览工具维护本地 HTTP 服务、隔离 iframe、页面状态双向同步、四种说明组件、编号说明、单次精确点选、统一Agent讨论与视觉预览、动态控件、完整当前会话和公开活动记录，不注册 MCP、hooks 或遥测。
[技术结构](html-design.md) 解释协议、编译边界和按需导出；[验证范围](validation.md) 说明检查证据。

## 外部来源与许可

优先项目已确认规范。按当前问题读取官方现行页面或默认分支最小部分，不复制完整上游手册或实际素材。
保留已有许可证和来源声明；维护适配时核对上游当前许可，失败时如实说明，不称已验证最新。
参考方法、设计素材和代码依赖分别核对许可。
生图按当前环境的 imagegen 工具/Skill 使用，检查实际导入与版面；不能只记录提示词就称素材交付。
Live 复用 workbench/vendor/impeccable 的 DOM 辅助模块，保留固定提交、Apache-2.0 LICENSE 和 NOTICE；插件实现适合 json-render 资源的 Agent 生命周期适配，不宣称整体内嵌上游 Live 服务。更新时核对上游来源与授权，并同步离线 HTML 内的许可。

## 版本与分发

插件清单、package.json、锁文件版本同步。使用 SemVer，本地正式源版本不带缓存后缀；远端发布与推送需明确授权。
日常迭代不自动递增版本；有明确版本或发布需求时再同步调整。
市场稳定名为 design-harness，根 source.path 为 ./，ZIP 中转换为 ./plugins/design-harness。
npm ci 安装依赖，npm run check 验证，npm run package -- --out <新目录> 打包；拒绝覆盖并输出 SHA-256。
保留品牌和许可证；.harness、openspec、node_modules、dist、私有设计工作区不进入包。
验证入口指导完整性、脱离完整插件时的明确错误、完整插件在全新路径安装解压及离线交付；构建成功、真实浏览器运行、设计验收与用户批准分别报告。
