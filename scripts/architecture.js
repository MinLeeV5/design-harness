import fs from "node:fs";
import path from "node:path";
import {builtinModules,createRequire} from "node:module";
import {isFile,isWithin,walk} from "./files.js";

const requireTool=createRequire(import.meta.url);
let parse;
const sourceFile = /\.(?:[cm]?js|tsx?|mts)$/;
const nativeModules = new Set(builtinModules.map(name=>name.replace(/^node:/,"")));
const allowed = {
  contracts: ["contracts/"],
  frontend: ["frontend/","contracts/","assets/"],
  preview: ["preview/","contracts/","vendor/"],
  "backend/http": ["backend/http/","backend/services/","contracts/"],
  "backend/services": ["backend/services/","backend/adapters/","backend/paths.mjs","contracts/"],
  "backend/adapters": ["backend/adapters/","backend/paths.mjs","contracts/"],
  backend: ["backend/paths.mjs"],
  cli: ["cli/","backend/","contracts/"]
};

const moduleName = relative => relative.startsWith("src/") ? relative.slice(4) : relative;
const matches = (name, prefix) => prefix.endsWith("/") ? name.startsWith(prefix) : name === prefix;

function dependencies(file,text) {
  const tree=parse(text,{
    sourceType:"module",sourceFilename:file,createImportExpressions:true,attachComment:false,
    plugins:[["typescript",{dts:/\.d\.(?:ts|mts)$/.test(file)}],"jsx"]
  });
  const specifiers=[];
  let fetches=false;
  function visit(node) {
    if (!node || typeof node.type!=="string") return;
    if (["ImportDeclaration","ExportNamedDeclaration","ExportAllDeclaration","ImportExpression"].includes(node.type) && node.source?.type==="StringLiteral") {
      specifiers.push(node.source.value);
    }
    if (node.type==="TSImportType" && node.argument?.type==="StringLiteral") {
      specifiers.push(node.argument.value);
    }
    if (node.type==="CallExpression") {
      if (node.callee.type==="Import" && node.arguments[0]?.type==="StringLiteral") {
        specifiers.push(node.arguments[0].value);
      }
      const expression=node.callee;
      if (expression.type==="Identifier" && expression.name==="fetch" || expression.type==="MemberExpression" &&
        expression.object.type==="Identifier" && ["window","globalThis"].includes(expression.object.name) &&
        (expression.computed ? expression.property.value : expression.property.name)==="fetch") fetches=true;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value==="object") visit(value);
    }
  }
  visit(tree);
  return {specifiers,fetches};
}

export function validateArchitecture(root) {
  const tool = path.join(fs.realpathSync(root),"workbench"), source = path.join(tool,"src"), errors = [];
  if (!fs.existsSync(source)) return errors;
  try { parse ??= requireTool("@babel/parser").parse; }
  catch { return ["Workbench architecture validation requires installed development dependencies; run npm ci"]; }
  for (const file of walk(source)) {
    if (!isFile(file) || !sourceFile.test(file)) continue;
    const relative = path.relative(source,file).split(path.sep).join("/");
    const scope = Object.keys(allowed).find(name => relative.startsWith(name+"/"));
    if (!scope) { errors.push("Unknown workbench module: "+relative); continue; }
    const text = fs.readFileSync(file,"utf8");
    let parsed;
    try { parsed=dependencies(file,text); }
    catch (error) { errors.push("Invalid workbench syntax: "+relative+": "+error.message); continue; }
    const {specifiers,fetches}=parsed;
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) {
        if ((scope === "contracts" || scope === "frontend" || scope === "preview") && (specifier.startsWith("node:") || nativeModules.has(specifier))) {
          errors.push("Workbench runtime boundary: "+relative+" imports "+specifier);
        }
        if (scope === "contracts" && /^react(?:-dom)?(?:\/|$)/.test(specifier)) {
          errors.push("Workbench contracts must be runtime-independent: "+relative);
        }
        if (scope === "backend/services" && /^(?:node:)?(?:fs|child_process)(?:\/|$)/.test(specifier)) {
          errors.push("Workbench services must use adapters: "+relative);
        }
        continue;
      }
      const base = path.resolve(path.dirname(file),specifier);
      const target = [base,...[".ts",".tsx",".mjs",".js",".d.mts"].map(extension=>base+extension)]
        .find(isFile);
      if (!target) { errors.push("Missing workbench import: "+relative+" -> "+specifier); continue; }
      const real = fs.realpathSync(target);
      const name = moduleName(path.relative(tool,real).split(path.sep).join("/"));
      if (!isWithin(tool,real) || !allowed[scope].some(prefix=>matches(name,prefix))) {
        errors.push("Workbench dependency boundary: "+relative+" -> "+name);
      }
    }
    if (scope === "frontend" && !relative.startsWith("frontend/api/") && fetches) {
      errors.push("Workbench requests belong in frontend/api: "+relative);
    }
  }
  return errors;
}
