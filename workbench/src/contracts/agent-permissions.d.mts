import type {AgentPermissionMode} from "./types";
export const permissionModes:{value:AgentPermissionMode;label:string;description:string}[];
export const fullAccessWarning:string;
export function validatePermissionMode(value?:unknown):AgentPermissionMode;
export function permissionLabel(value?:string):string;
