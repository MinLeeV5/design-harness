export type DesignOrganization={mode:"continuous";primary:string}|{mode:"per-requirement"};
export type RequirementPurpose="design"|"foundation-preview";
export function designOrganization(project:{designOrganization?:unknown}):DesignOrganization|null;
export function requirementPurpose(manifest:{purpose?:unknown}):RequirementPurpose;
export function creationPurpose(project:{designOrganization?:unknown},id:string,options?:{separate?:boolean;preview?:boolean}):RequirementPurpose;
