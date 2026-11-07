import type {AgentProposal} from "./types";
export const explorationSchema:object;
export function explorationSchemaFor(count?:number):object;
export function explorationCount(prompt:unknown,fallback?:number):number;
export function requestsExploration(prompt:unknown):boolean;
export function proposalPage(proposal:AgentProposal|undefined,page:string):AgentProposal|undefined;
