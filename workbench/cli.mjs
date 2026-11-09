#!/usr/bin/env node
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {launch} from "./src/cli/launch.mjs";

export async function main(args) {
  return (await import("./src/cli/main.mjs")).main(args);
}

// npm local/global bins and optional plugin entries share this command.
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launch().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
