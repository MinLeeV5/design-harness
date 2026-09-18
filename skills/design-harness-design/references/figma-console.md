# Console：约束读取与多方案设计

仅在发现或选择 figma-console-mcp 时读取。工具名是能力定位线索，实际命名空间、参数、模式限制和返回结构以当前工具说明为准。需求确认、方案范围与知识回写沿用 [通用读写流程](figma-operations.md)。

## 连接与目标

1. 若有 `figma_get_status`，先用 `probe: true` 检查实际响应；工具已注册或服务运行不代表目标文件已连接。状态未变化时不反复探测。探测成功仍需核对 editorType、权限与操作限制，实际写入结果在首个已批准批次中验证，不创建额外测试节点。
2. 本地模式通过 `figma_list_open_files` 核对用户 URL 的 fileKey，不默认选活动文件。未连接时说明需要在目标文件运行 Desktop Bridge；其他连接器可访问正确目标时可继续，否则先完成对话与已有资料支持的工作。
3. 本地 `figma_execute` 的 fileKey 仅限定该次执行，不会改变其他专用工具的活动文件。工具没有文件参数时，先用 `figma_navigate` 的实际参数定位并固定已连接的目标文件，回读确认后再操作；断线或切换后重新核对，结束时按工具能力释放本次固定。
4. Cloud 模式核对当前配对文件，不传其不支持的本地 fileKey 参数；Remote 只读模式只用于读取。当前模式与写入能力由探测结果决定。

## 根据当前需求匹配

| 当前需求 | 已发现时优先考虑 | 使用范围 |
| --- | --- | --- |
| 读取 Harness 入口、相关模块与资源 | `figma_execute` + 本 Skill 的有界读取助手；或 `figma_get_file_data` | 先入口再必要节点；从 `summary`、浅层和 nodeIds 开始，不一次导出全文件 |
| 用户说“这个组件/选区” | `figma_get_selection` | 核对文件后取得选区；用户明确 URL 优先 |
| 查找项目已有组件与属性 | `figma_search_components`、`figma_get_component_details` | 进入组件操作时先按本次需求查询并分页，不复用未经核对的旧 nodeId 或跨项目同名结果 |
| 实例化项目组件 | `figma_instantiate_component` | 按查询结果同时传 componentKey 与 nodeId，并指定已授权 parentId、变体和内容；未发布组件也需真实节点定位 |
| 改实例文案、显隐或变体 | `figma_set_instance_properties` | 先读实际暴露的属性；不要把实例内部的文本当成普通 TEXT 直接覆盖。Slot 使用支持的专用操作或原生 API |
| 调整普通文本、尺寸、颜色或局部位置 | `figma_set_text`、`figma_resize_node`、`figma_set_fills`、`figma_move_node` | 仅在真实类型、参数及目标范围匹配时使用；改父级、跨 Page 和 Auto Layout 不能用坐标移动替代 |
| 新需求 Page、复制模板、安排多套布局 | `figma_execute` | 先检查已有 Page 和目标区域，指定父容器，用项目组件与可编辑结构组织方案；复制与归位同次完成，避免污染原稿 |
| 查询项目 Token 与样式 | `figma_get_variables`、`figma_get_styles` | 按当前方案的 collection/名称/mode 过滤，保持 token 引用；样式回退结果不是完整变量库 |
| 已确认知识增量涉及变量/组件库 | `figma_batch_create_variables`、`figma_batch_update_variables`、`figma_create_component_set` 或执行工具 | 仅按已批准增量执行；候选方案不自动改全局变量或现有主组件，建变体集前核对是否会移动/重命名源组件 |
| 比较方案和写后验证 | 局部节点回读 + `figma_capture_screenshot` | 以相同目标尺寸查看各方案真实节点与必要状态，不以工具成功返回替代视觉检查 |

专用工具无法完整表达需求时再用脚本，避免用多个不完整的操作拼出越界修改。切换到另一连接器前先回读已完成结果，不能把部分成功的设计再次生成。

## 执行与验证

将 [figma-reader.js](../scripts/figma-reader.js) 的函数源码放进 `figma_execute.code`，末尾追加 `return await readDesignHarness(figma, request)`，request 按 [有界读取说明](figma-operations.md) 填入真实目标。Page 元数据读取成功后再读取入口/模块小节点，不为新需求扩扫全部设计库。

Console 和 `use_figma` 的运行环境可能有不同扩展；执行脚本时按当前 API 加载字体、创建节点、绑定变量并返回本次 ID。不要直接重放另一个连接器依赖扩展方法的写入脚本。

检查外层错误、逐项 warnings、`resultAnalysis.warning` 和返回节点。批量操作不是天然原子事务；只修正失败项并回读，避免重复创建。实例属性、变量绑定、布局及知识增量均要核对实际结果。

修改后的截图优先 `figma_capture_screenshot`，指定本次节点并确保活动文件一致。`figma_take_screenshot` 可能回退到 REST，需核对来源与新鲜度；拿不到本次状态时明确视觉未核验。一次设计系统审计或评分不能替代 [方案检查](evaluation.md)，按需求使用局部审计，不默认运行全库扫描。

维护或参数有疑问时读取上游最新 [工具与能力](https://github.com/southleft/figma-console-mcp) 和 [连接说明](https://github.com/southleft/figma-console-mcp/blob/HEAD/docs/setup.md)。不固定工具数量或版本，也不把上游的其他安装和自动化流程变成本 Skill 的前提。
