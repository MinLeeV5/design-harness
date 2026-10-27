import {defineCatalog} from "@json-render/core";
import {schema} from "@json-render/react/schema";
import {z} from "zod";
import {componentDefinitions} from "@design-harness/foundation/catalog";
export const catalog=defineCatalog(schema,{components:{...componentDefinitions,
  TaskWorkspace:{props:z.object({title:z.string()}),slots:["default"],description:"示例任务页面的布局与导航"},
  TaskForm:{props:z.object({radius:z.number().min(4).max(28),gap:z.number().min(12).max(36)}),description:"任务输入和必填校验"},
  TaskProgress:{props:z.object({}),description:"任务进度"},TaskError:{props:z.object({}),description:"失败与重试"},TaskResult:{props:z.object({}),description:"结果和材料下载"}
},actions:{runTask:{description:"本地模拟运行，不访问真实服务"}}});
