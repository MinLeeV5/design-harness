import type {AgentControl,AgentProposal,Spec,Value} from "./types";
export function validateControls(controls:AgentControl[],spec:Spec,css:Record<string,string>):AgentControl[];
export function controlValues(controls:AgentControl[],spec:Spec,css:Record<string,string>):Record<string,Value>;
export function tuneProposal(proposal:AgentProposal,values:Record<string,Value>):AgentProposal;
