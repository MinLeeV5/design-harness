import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {validateArchitecture} from "../scripts/architecture.js";

function fixture(files, check) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"design-harness-architecture-"));
  try {
    for(const [name,text] of Object.entries(files)) {
      const file=path.join(root,"workbench/src",name);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,text);
    }
    check(validateArchitecture(root));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}

test("Architecture allows shared contracts, service adapters and centralized browser requests",()=>{
  fixture({
    "contracts/data.ts":"export type Data={id:string};",
    "backend/adapters/store.mjs":"export const read=()=>({id:'one'});",
    "backend/services/project.mjs":"import {read} from '../adapters/store.mjs'; export {read};",
    "backend/http/routes.mjs":"import {read} from '../services/project.mjs';",
    "frontend/api/client.ts":"export const read=()=>fetch('/project');",
    "frontend/app.tsx":"import type {Data} from '../contracts/data'; import {read} from './api/client';"
  },errors=>assert.deepEqual(errors,[]));
});

test("Architecture rejects browser-server coupling, adapter inversions and service filesystem access",()=>{
  fixture({
    "backend/adapters/store.mjs":"import {save} from '../services/project.mjs';",
    "backend/services/project.mjs":"import fs from 'node:fs'; export const save=()=>{};",
    "frontend/app.tsx":"import {save} from '../backend/services/project.mjs'; fetch('/project');",
    "preview/runtime.tsx":"import '../frontend/app';",
    "contracts/data.ts":"import fs from 'node:fs'; import React from 'react';"
  },errors=>{
    assert.equal(errors.length,7);
    assert.ok(errors.some(error=>error.includes("adapters/store.mjs -> backend/services")));
    assert.ok(errors.some(error=>error.includes("requests belong in frontend/api")));
    assert.ok(errors.some(error=>error.includes("services must use adapters")));
  });
});

test("Architecture checks dynamic imports, re-exports and missing moved modules",()=>{
  fixture({
    "backend/adapters/store.mjs":"export const read=()=>{};",
    "frontend/app.tsx":"export {read} from '../backend/adapters/store.mjs'; import('../backend/adapters/store.mjs'); import './gone';"
  },errors=>{
    assert.equal(errors.filter(error=>error.includes("dependency boundary")).length,2);
    assert.ok(errors.some(error=>error.includes("Missing workbench import")));
  });
});

test("Architecture parses mixed and multiline imports without matching comments or strings",()=>{
  fixture({
    "backend/services/project.mjs":"import fs, {readFileSync} from 'node:fs'; export default {}; export const save=()=>{};",
    "frontend/app.tsx":"import Default, {\n save\n} from '../backend/services/project.mjs'; window.fetch('/project');",
    "contracts/data.ts":"// import React from 'react';\nconst example=\"import fs from 'node:fs'\"; export {example};"
  },errors=>{
    assert.equal(errors.length,3);
    assert.ok(errors.some(error=>error.includes("services must use adapters")));
    assert.ok(errors.some(error=>error.includes("frontend/app.tsx -> backend/services")));
    assert.ok(!errors.some(error=>error.includes("contracts/data.ts")));
  });
});
