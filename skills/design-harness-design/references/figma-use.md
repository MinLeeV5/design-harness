# use_figma：按当前能力执行

仅在选择 `use_figma` 或同一 Figma 连接器的读取工具时加载。本页负责衔接，具体 API 以当前会话安装的 Figma Skill 和工具契约为准，不固定版本或复制整份 API 文档。

## 访问与前置说明

- 从用户已提供的 URL 取得目标 fileKey。先读取所需的 Page 元数据或小节点确认访问；不要为验证写权限创建无意义节点。该操作成功只证明相应读取可用。
- 调用 `use_figma` 前加载当前可用的 `figma-use` Skill，并按其要求设置 `skillNames`。需要变量/组件库时加载 `figma-generate-library`，生成页面时加载适用的 `figma-generate-design`。这些前置要求属于所选工具，不要求 Console 路径也具备同一组 Skill。
- `get_design_context` 用于确需实现上下文的任务，调用前遵守 `figma-design-to-code` 的要求；读取 Harness 原生文本通常使用局部节点读取即可。
- 使用现有项目内的 Page，创建新 Figma 文件属于另一个范围。工具及前置说明缺失时，回到 [工具选择](figma-operations.md) 匹配其他可用能力，不凭记忆虚构调用。

## 需求与执行

| 当前需求 | 使用方式 |
| --- | --- |
| 定位 Page、入口与模块 | 在 `use_figma.code` 放入本 Skill 的 [读取助手](../scripts/figma-reader.js)，追加 `return await readDesignHarness(figma, request)`；request 见 [有界读取说明](figma-operations.md) |
| 变量、组件、原生文本与布局 | 读取当前 API 的相关类型与方法，按已批准范围用 `use_figma` 分步执行；返回本次真实节点和资产 ID |
| 局部属性、结构与截图 | 按实际能力用 `get_metadata`、`get_screenshot` 或受支持的节点读取/截图方法，限定目标 fileKey 与 nodeId |

`use_figma` 与 Console 不保证具有相同扩展方法；例如某一运行环境的 Auto Layout 或截图辅助方法不能直接移植到另一环境。只复用已核对支持的 API。有界读取助手本身无连接器依赖，但真实执行兼容性仍以当前连接验证为准。

正文采用当前工具支持的 JavaScript、顶层 await 与 return 返回结构化结果。按当前契约选择 Page、先加载实际字体，再修改文本。变量/样式的文件级范围与页面内操作分别核对，不因为工具能够修改就扩大写入范围。

## 验证与恢复

每个已批准写入批次后回读本次节点、属性、绑定与来源关系，再取得能反映本次修改的截图。局部修正后只复核受影响部分；未取得实际截图时说明视觉未核验。

调用失败时阅读实际错误与工具提供的重试提示。不能确定是否写入的超时，先回读目标区域，再修复或补缺；切换到 Console 时也先核对已完成结果。只清理可确认由本次失败产生的临时对象，保留用户已有资产。
