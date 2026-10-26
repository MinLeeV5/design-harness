# 设计交付协议 1

## 文件及权威来源

| 文件 | 职责 |
| --- | --- |
| workspace.json | schemaVersion=1、templateVersion、项目工作区名称 |
| foundation/foundation.json | 公共基础版本、确认状态与简短说明 |
| requirement.md | PRD、UX 规则、验收条件，标题使用稳定锚点 |
| manifest.json | schemaVersion=1、需求 ID、页面、候选、视口、调参定义、固定基础版本 |
| scenarios.json | 各场景的页面、初始状态与界面说明关联 |
| src/ | React 页面、交互和本地模拟；UI 的唯一实现来源 |
| candidates/*.json | 当前候选的参数覆盖值 |
| foundation/ | 当前需求固定的基础副本 |
| handoff.md | 真实决定、依据、当前产物、验证及未决项 |
| assets/ | 本需求图片与字体等资源，通过 ESM 导入 |
| releases/<id>/<version>/ | 固定 HTML、源码快照与字节清单 |

可执行字段验证由 [协议实现](../assets/workspace/studio/lib/protocol.mjs) 维护；React 接口由 [types.ts](../assets/workspace/studio/types.ts) 定义。
参考 [manifest 示例](../assets/workspace/studio/starter/manifest.json)、[场景示例](../assets/workspace/studio/starter/scenarios.json) 和 [说明示例](../assets/workspace/studio/starter/requirement.md)，按实际需求替换，不复制示例业务事实。

## 页面与场景

页面默认导出接收 PageProps 的 React 组件：scenario 提供当前初始状态，candidate 提供当前候选 ID。
页面及候选入口均为需求内的相对路径；候选可用 entries 对个别页面替换 TSX 入口。大幅布局变化直接写 React，不建立 JSON UI 树。
场景切换和「重置当前场景」重新初始化页面。输入、反馈、分支与状态保留在同一可运行产物中；模拟过程清楚标识。
业务服务、权限、外部 Agent 和设备能力分别验证，本地演示不证明生产行为。

## 稳定定位

界面用 data-dh-id="task-form"；文档用 Markdown 标题「## 输入规则 {#input}」；场景 annotations 用 target 与 section 关联。
ID 在同一实际页面中唯一，不使用易变化的文案、CSS 类或节点序号作为定位。
点击说明可定位界面，点选界面可关联说明并复制含需求、页面、场景、候选、视口和目标的反馈。
协议检查发现失效文档锚点即失败；目标是否真实出现、ID 是否重复由浏览器检查，不以源码中出现字符串代替。

## 视觉候选与参数

每个候选具有独立 params 路径；相同场景、内容与真实视口下比较。
controls 当前支持 range：id、label、target、cssVar、min/max/step/default、unit（px 或空串）。
CSS 变量应被页面或固定基础实际消费；无对应参数时提供定位反馈，由 Agent 修改源组件。
拖动参数立即更新当前候选的预览；保存只改候选 JSON，带 expectedHash 防止覆盖其他编辑。源码结构与文案由 Agent 修改。
候选验收与最终选定分别记录；只需明确属性修改时直接执行，无需固定生成多套方案。
