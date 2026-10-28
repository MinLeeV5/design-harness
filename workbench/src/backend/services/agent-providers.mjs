import {assert} from "../../contracts/assertions.mjs";
import {createCodexProvider} from "../adapters/codex-app-server.mjs";
import {createCodexConnection} from "../adapters/codex-connection.mjs";

// Registration is deliberately small; proposal and UI services depend only on
// this provider contract, not on native thread/turn or wire event formats.
export function createAgentProvider({id="codex",run,connection=createCodexConnection()}={}) {
  assert(id==="codex","当前仅支持 Codex");
  if(!run)return createCodexProvider({connection});
  // Deterministic execution seam for tests and local browser fixtures.
  return {id,capabilities:{images:true,structuredOutput:true,interrupt:true},inspect:options=>connection.read(options),selectModel:(...args)=>connection.select(...args),record:(...args)=>connection.record(...args),createSession:async({id})=>({id}),runTurn:run,closeSession:async()=>{},dispose:()=>connection.close?.()};
}
