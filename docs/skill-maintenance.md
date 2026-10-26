# Skill 维护指南

## 设计流程与知识

四个入口显式启动，交互和视觉共同编辑同一 React 产物。维护流程时读取实际影响阶段的 references/workflow.md、evaluation.md。
不恢复固定逐页逐状态审批，不强制小修改探索多套候选。范围内直接落实明确改动；关键业务行为或交付边界变化才重新对齐。
真实决定、反馈与实际变化记入需求 handoff.md，工具成功和导出版本不等于验收。公共回写仅批准增量。

使用方设计知识、需求与固定交付保存在仓库 design-harness/。项目规范和真实代码用于建立当前事实；已确认未来设计单独表达。
协议、稳定定位和恢复方式见 [协议](../skills/design-harness-init/references/protocol.md)、[交接](../skills/design-harness-init/references/handoff.md)。
模板默认值保持草稿身份，通用分发包不包含真实项目标识、路径或任务记录。

## Skill 结构与运行

每个 Skill 自包含 SKILL.md、agents、references、scripts、assets 和适用许可，不引用兄弟 Skill 或插件根目录运行资源。
四个入口携带相同的 workspace 模板、初始化助手与工作区/协议/预览/交接指导。
Init 的 assets/workspace 是开发源；修改后运行 npm run sync:runtime。分发校验要求所有副本一致，禁止依赖源码软链接。
各阶段独立维护工作流和评价，只有 Init/视觉携带资产方法，其余阶段不引入生图流程。

运行模板使用 Node.js 22+、React、TypeScript 与 esbuild，依赖与锁文件随模板携带。
预览工具自行实现本地 HTTP 服务、隔离 iframe 和有限参数写回，不注册 MCP、hooks 或遥测。
[技术结构](html-design.md) 解释协议、编译边界和快照实现；[验证范围](validation.md) 说明检查证据。

## 外部来源与许可

优先项目已确认规范。按当前问题读取官方现行页面或默认分支最小部分，不复制完整上游手册或实际素材。
保留已有许可证和来源声明；维护适配时核对上游当前许可，失败时如实说明，不称已验证最新。
参考方法、设计素材和代码依赖分别核对许可。
生图按当前环境的 imagegen 工具/Skill 使用，检查实际导入与版面；不能只记录提示词就称素材交付。
当前 Live 是原创有限实现，不宣称分发 Impeccable 引擎。

## 版本与分发

插件清单、package.json、锁文件版本同步。使用 SemVer，本地正式源版本不带缓存后缀；远端发布与推送需明确授权。
日常迭代不自动递增版本；有明确版本或发布需求时再同步调整。
市场稳定名为 design-harness，根 source.path 为 ./，ZIP 中转换为 ./plugins/design-harness。
npm ci 安装依赖，npm run check 验证，npm run package -- --out <新目录> 打包；拒绝覆盖并输出 SHA-256。
保留品牌和许可证；.harness、openspec、node_modules、dist、私有设计工作区不进入包。
验证单 Skill 复制、全新路径解压与离线交付；构建成功、真实浏览器运行、设计验收与用户批准分别报告。
