import type {AgentSettings,AgentSettingsPatch} from "./types";
export function defaultAgentSettings():AgentSettings;
export function validateAgentSettings(value:unknown):AgentSettings;
export function mergeAgentSettings(before:AgentSettings,patch:AgentSettingsPatch):AgentSettings;
export function effortLabel(value:string):string;
