# 本地设计工作区

这是独立的设计交付工程。React 页面不导入产品业务代码；交互使用明确的本地场景数据。

- 安装依赖：npm ci
- 新建需求：npm run new -- <需求ID> --title <标题>
- 预览：npm run dev
- 校验协议与构建：npm run check
- 类型检查：npm run typecheck
- 固定交付：npm run export -- <需求ID> v1
- 验证交付字节：npm run verify -- releases/<需求ID>/v1
- 显式升级基础：npm run upgrade -- <原需求ID> <新需求ID>

编辑 foundation/ 维护后续需求使用的公共基础；已有需求使用自己 foundation/ 中的快照。
公共基础改变后应更新 foundation.json 的版本与设计说明。既有需求不随公共基础变化。

每个需求的 manifest.json 登记页面、候选、视口和可调 CSS 变量。scenarios.json 登记场景初始数据及界面与文档的关联。
React 页面默认导出接收 PageProps 的组件，通过 data-dh-id 提供稳定定位；文档标题用 {#section-id} 定义锚点。
界面资源通过 ESM 导入图片或字体，构建时内嵌。外部链接可供阅读，产品预览不访问业务服务。

工作台点选区域可关联说明、复制定位反馈；调参即时预览，点击保存写回当前候选 JSON。
保存采用内容哈希比较，遇到外部修改会拒绝覆盖。React 结构变化由 Agent 修改源文件，保存后预览自动重载。
两方案比较共享场景与真实视口尺寸；交互在各自预览中独立运行。

导出目录包含单文件 index.html、源码快照与 SHA-256 清单；复制 index.html 即可离线分享。
导出文件不连接本地保存服务。浏览器内的场景体验、临时调参与材料演示不改写固定源版本。
导出不表示用户验收，真实确认结论维护在需求 handoff.md 中。
