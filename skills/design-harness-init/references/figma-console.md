# Console：现状盘点与原生资产补齐

仅在发现或选择 figma-console-mcp 时读取。工具名是能力定位线索，实际命名空间、参数、模式限制和返回结构以当前工具说明为准。项目范围与模块确认沿用 [通用读写流程](figma-operations.md)。

## 连接与目标

1. 若有 `figma_get_status`，先用 `probe: true` 检查实际响应。服务存在、TCP 打开或返回工具列表，都不等于目标文件已经连接。探测失败时记录具体缺口；不要反复重试未变化的连接。探测成功仍需核对 editorType、权限与操作限制，实际写入结果在首个已批准批次中验证，不创建额外测试节点。
2. 本地模式通过 `figma_list_open_files` 核对用户 URL 的 fileKey。不要默认选择活动文件或第一个连接；没有目标连接时说明需要在目标文件运行 Desktop Bridge，仍可继续代码调查或改用已可用的连接器。
3. 支持显式目标的 `figma_execute` 在本地模式可传该 fileKey；这不会切换其他工具的活动目标。专用工具若没有文件参数，先用 `figma_navigate` 的实际参数定位并固定已连接的目标文件，回读确认后再操作。断线或切换后重新核对，结束时按工具能力释放本次固定。
4. Cloud 模式按当前配对文件确认目标，不传其不支持的本地 `fileKey` 参数；Remote 只读模式不用于生成资产。模式和参数从实际探测读取，不套用本地模式示例。

## 根据当前模块匹配

| 当前需求 | 已发现时优先考虑 | 使用范围 |
| --- | --- | --- |
| Page 目录、Harness 入口、模块文本 | `figma_execute` + 本 Skill 的有界读取助手；或 `figma_get_file_data` 的局部读取 | Page 列表只取名称/ID；文件数据先 `summary`、浅层及具体 nodeIds，需要全文时仅取小型 TEXT 节点 |
| 用户指向选中对象 | `figma_get_selection` | 已确认目标文件后读取，不能以选区替代用户明确 URL |
| Token、变量与样式盘点 | `figma_get_variables`、`figma_get_styles` | 先概览，再按 collection、名称、mode 过滤；变量使用分页，修改后需要时刷新缓存；样式回退结果不能当成完整变量库 |
| 查找并核对现有组件 | `figma_search_components`、`figma_get_component_details` | 进入组件操作时按相关名称/类别查询并限制条数；重新核对 nodeId、key、属性及源文件，不跨项目全库搜索 |
| 查询已知团队库与素材 | `figma_get_library_components`、`figma_get_library_variables` 等当前能力 | 使用真实库文件定位，按当前阶段的来源与范围约定过滤；单库结果不等于完整 Teams 清单，缺目录能力如实说明 |
| 在已确认集合内新增/更新变量 | `figma_batch_create_variables`、`figma_batch_update_variables` | 批量优于逐条调用；collectionId、modeId 与变量 ID 来自本次读取，按当前批量上限拆分 |
| 建立已批准的新 Token 集合与模式 | `figma_setup_design_tokens` | 仅用于确需新集合的范围；已有集合复用，不为更新现有变量重建整套系统 |
| 创建组件变体集 | `figma_create_component_set`；不足时 `figma_execute` | 使用已确认的属性轴与目标 parentId，按项目风格布置；每个变体仍需具体设计和验证，克隆组合不等于状态已设计 |
| 从原稿复制到 Harness、建 Page/布局/说明 | `figma_execute` | 检查已有 Page，指定目标父容器，用原生 TEXT 与可编辑节点；复制与归位放在同次操作中，避免把副本留在历史 Page |
| 生成后检查 | `figma_execute` 或局部读取 + `figma_capture_screenshot` | 回读本次 ID、绑定与属性，截图指定目标节点并核对当前状态 |

普通节点的移动或复制工具不一定支持跨 Page/改父级；参数无法完整表达目标时使用执行工具，不把坐标移动当作重新归属。`figma_create_component_set` 可能重命名、移动或使用原组件作为首个变体；保留原稿时先在目标 Page 复制源组件，再对副本建库。它的自动排布样式也必须符合项目规范，不能直接采用默认白底展示。

代码盘点继续使用项目代码搜索与平台依据。只有需求确需代码提取、当前工具确实支持项目技术栈且允许生成相应本地文件时，才考虑 `figma_ds_*`；例如面向 Web 的提取器不能假定能分析 Android XML/Kotlin。

## 执行与验证

将 [figma-reader.js](../scripts/figma-reader.js) 的函数源码放进 `figma_execute.code`，末尾追加 `return await readDesignHarness(figma, request)`，request 采用 [有界读取说明](figma-operations.md) 的真实目标。先验证 Page 元数据读取，再读取必要小节点；不调用全文件加载。

脚本按当前运行环境加载字体、创建节点并返回本次 ID。`use_figma` 的扩展方法未必存在于 Console；按 Console 的 Plugin API 契约使用原生 API，不能只更换工具名就重放整段写入脚本。

检查工具外层错误、执行结果、逐项 warnings 和 `resultAnalysis.warning`。Token 批量操作可能部分成功；未解析的别名、缺失 mode 值须逐项修正并回读，不能把一次成功返回视作整批原子完成。

写后截图优先 `figma_capture_screenshot` 获取 Bridge 当前状态；`figma_take_screenshot` 可能回退到 REST，要核对其来源与新鲜度。没有本次修改的截图时标明视觉未核验。截图和没有 fileKey 的专用工具同样需要核对活动文件。

维护或参数有疑问时读取上游最新 [工具与能力](https://github.com/southleft/figma-console-mcp) 和 [连接说明](https://github.com/southleft/figma-console-mcp/blob/HEAD/docs/setup.md)。不固定工具数量或版本，不把完整上游工具目录加载为项目上下文。
