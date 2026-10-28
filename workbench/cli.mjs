#!/usr/bin/env node
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {main} from "./src/cli/main.mjs";

export {main};

// Keep the plugin's public command stable while its implementation evolves.
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => {
    if (result) console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
