import path from "node:path";
import {createRequire} from "node:module";

export const TOOL = path.resolve(import.meta.dirname, "../..");
export const PLUGIN = path.dirname(TOOL);
export const requireTool = createRequire(path.join(PLUGIN, "package.json"));
export const frontendFile = () => path.join(TOOL, "src/frontend/index.tsx");
export const previewFile = () => path.join(TOOL, "src/preview/runtime.tsx");
export const sdkFile = () => path.join(TOOL, "src/preview/sdk.tsx");
