import type {AgentActivity,AgentModel,CodexConnection} from "./types";
export interface AgentProvider {
  id:string;
  capabilities:{images:boolean;structuredOutput:boolean;interrupt:boolean};
  inspect(options?:{refresh?:boolean}):Promise<CodexConnection>;
  selectModel(model:string,effort:string):Promise<AgentModel>;
  createSession(input:{id:string;directory:string;model:AgentModel}):Promise<unknown>;
  runTurn(input:{session:unknown;directory:string;prompt:string;schema:object;imageFiles:string[];model:AgentModel;signal:AbortSignal;onEvent:(event:Omit<AgentActivity,"startedAt">)=>void}):Promise<{summary:string;files:{path:string;content:string}[];controls?:unknown[]}>;
  closeSession(session:unknown):Promise<void>;
  dispose():Promise<void>;
}
