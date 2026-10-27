import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
export const TOOL = fs.existsSync(path.resolve(import.meta.dirname,"../app.tsx")) ? path.resolve(import.meta.dirname,"..") : import.meta.dirname;
export const PLUGIN = fs.existsSync(path.join(TOOL,"package.json")) ? TOOL : path.dirname(TOOL);
export const requireTool = createRequire(path.join(PLUGIN,"package.json"));
export const toolFile = name => path.join(TOOL,name);
export const previewFile = () => toolFile(fs.existsSync(toolFile("preview.tsx")) ? "preview.tsx" : "preview.js");
export const sdkFile = () => toolFile(fs.existsSync(toolFile("sdk.tsx")) ? "sdk.tsx" : "sdk.js");
