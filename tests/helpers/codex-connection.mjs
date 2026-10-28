import {createCodexConnection} from "../../workbench/src/backend/adapters/codex-connection.mjs";
import {defaultAgentSettings,mergeAgentSettings} from "../../workbench/src/contracts/agent-settings.mjs";
export const testStatus=()=>({available:true,provider:{id:"test",name:"测试 Provider"},auth:"authenticated",authMode:"chatgpt",defaultModel:"test-vision",defaultEffort:"high",catalogAvailable:true,models:[{id:"test-vision",name:"Vision Test",images:true,efforts:["high"],defaultEffort:"high"},{id:"test-fast",name:"Fast Test",images:true,efforts:["low"],defaultEffort:"low"},{id:"text-only",name:"Text Test",images:false,efforts:[],defaultEffort:""}]});
export const testConnection=()=>createCodexConnection({inspect:async()=>testStatus()});
export function memoryPreferences(seed=defaultAgentSettings()){let value=structuredClone(seed);return {read:()=>structuredClone(value),async patch(patch){value=mergeAgentSettings(value,patch);return structuredClone(value);}};}
