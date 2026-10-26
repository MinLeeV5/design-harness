# HTML 设计运行结构

## 数据与源码

三层结构见[项目 README](../README.md#统一-react-模板)。React 页面为 UI 源码；Markdown 表达 PRD/UX，JSON 表达页面、场景、候选及关联。
[运行协议](../skills/design-harness-init/references/protocol.md)与[可执行验证](../skills/design-harness-init/assets/workspace/studio/lib/protocol.mjs)一起维护。

初始化助手不依赖运行库即可复制模板。需求创建时从公共 foundation 复制实际文件，不建立软链接。
页面只导入本需求、固定基础、工作台接口及安装依赖。构建时检查实际文件定位，拒绝业务源码和未固定基础。
依赖安装在设计工作区，业务包、路由、构建和服务不改变。

## 预览与 Live

预览画布占据工作台主体，交互说明、Live 和反馈从画布上的悬浮工具栏打开，共用非模态覆盖式抽屉，小屏使用底部浮层。
悬浮入口与面板均脱离正常布局流，重复点击入口可收起。开关面板不改变 iframe 的实际分辨率、缩放、位置或重建页面，调参值和反馈草稿由工作台持有。
关闭按钮和工作台 Esc 关闭面板并恢复入口焦点；预览仅在点选模式下转发 Esc，正常产品交互自行处理键盘事件。

esbuild 将页面/候选入口编译为独立 IIFE，内嵌 CSS 和通过 ESM 导入的资源。隔离 iframe 的真实尺寸决定响应式表现。
工作台与 iframe 用消息关联当前场景、候选参数、定位及实际元素；父端核对消息来源，预览不访问业务网络。
范围参数立即设置 CSS 变量；保存只写候选 JSON，用 SHA-256 比较防止覆盖外部编辑。任意 React 源码修改继续由 Agent 完成。

本地服务仅监听 127.0.0.1，验证 Host、Origin 和当前服务令牌；端点没有任意文件写入能力。
源码保存通过内容版本检测重载；有未保存参数时保留当前预览，待保存或恢复后再读取新源码。
这是一套有限的本地设计工具，不是通用在线 IDE 或多人协作服务器。

## 固定交付

每次导出重新构建，并核对源内容未在构建/快照期间变化。
index.html 嵌入各候选页面、文档、资源及工作台。离线版本保留体验和反馈导出，不连接本地写回接口。
sources/ 保存模板、当前需求及其固定基础、依赖清单与锁文件。release.json 记录实际文件 SHA-256；verify 同时拒绝缺失、改变和未登记文件。
目标版本目录创建采用拒绝覆盖方式，失败清理本次未完成目录。公共基础变化不进入已有需求或交付。
实际验收与导出分开，acceptance 默认 not-recorded。

## 已知能力边界

- Live 支持已登记 CSS 变量的有限参数写回，结构与自由样式由 Agent 改 React。
- 场景是设计模拟，需要项目进一步替换其规则和内容；通用示例不属于已确认项目基础。
- 只做本地评审与导出，无在线评论、多人编辑、发布或遥测。
- 项目知识不进入插件包，原 Figma 工作流不作为新链路依赖，旧资产不自动迁移。

技术依据：[React TypeScript](https://react.dev/learn/typescript)、[esbuild API](https://esbuild.github.io/api/)、[资源内嵌](https://esbuild.github.io/content-types/#data-url)。
