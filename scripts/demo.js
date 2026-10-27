import fs from "node:fs";
import path from "node:path";
import {initialize} from "../workbench/lib/workspace.mjs";
import {startServer} from "../workbench/lib/server.mjs";
const project=path.resolve(import.meta.dirname,"../dist/centralized-demo");fs.mkdirSync(project,{recursive:true});
const workspace=path.join(project,"design-harness");if(!fs.existsSync(workspace))initialize(project,{example:true});
const service=await startServer(workspace);console.log("Design Harness 示例："+service.origin);console.log("业务资源："+workspace);let closing=false;const close=()=>{if(!closing){closing=true;void service.close();}};process.once("SIGINT",close);process.once("SIGTERM",close);
