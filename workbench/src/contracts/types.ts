import type {Spec} from "@json-render/core";
export type {Spec};
export type Value = number|string|boolean;
export type Scenario = {id:string;page:string;title:string;state:Record<string,unknown>};
export type Control = {id:string;label:string;page:string;target:string;property:string;type:"range"|"text"|"boolean";min?:number;max?:number;step?:number;unit?:string;maxLength?:number};
export type Candidate = {id:string;title:string;registry:string;params:string;pages:Record<string,string>};
export type Manifest = {schemaVersion:1;renderer:"json-render/react";id:string;title:string;foundationVersion:string;pages:{id:string;title:string}[];navigation?:{pageStatePath:string};candidates:Candidate[];viewports:{id:string;title:string;width:number;height:number}[];controls:Control[]};
export type BundleData = {manifest:Manifest;scenarios:Scenario[];interactions:Interaction[];documentation:string;previews:Record<string,string>;specs:Record<string,Spec>;params:Record<string,{css:Record<string,string>}>;hashes:Record<string,string>;revision:string;requirements:{id:string;title:string}[];development:boolean;proposal?:boolean;token?:string};

export type Annotation={id:string;target:string;section:string;label:string;number:string;placement?:"auto"|"top"|"right"|"bottom"|"left"};
export type Interaction={id:string;page:string;target:string;label:string;view:"card"|"steps"|"rules"|"states";placement:NonNullable<Annotation["placement"]>;when:Record<string,unknown>;file:string;sources:{kind:string;ref:string}[];summary:string;intro:string;blocks:{title:string;html:string}[];html:string};
export type PreviewContext={page:string;state:Record<string,unknown>};
export type NavigationCommand={page:string;serial:number;phase:"prepare"|"commit"|"abort"};
export type DomSelection={domId:string;target:string;instance:string;label:string;tag:string;selector:string;html:string;styles:Record<string,string>;ancestors:{domId:string;label:string}[]};
export type AgentControl={id:string;label:string;type:"range"|"text"|"boolean";binding:"prop"|"css";target:string;property:string;min:number;max:number;step:number;unit:string};
export type AgentActivity={id:string;label:string;status:"running"|"done"|"failed"|"cancelled";startedAt:number;endedAt?:number;text?:string};
export type AgentRole="interaction"|"visual";
export type DesignReference={id:string;name:string;data:string};
export type AgentModel={id:string;name:string;provider:string;providerId:string;choice:string;effort:string;effortChoice?:string};
export type AgentSettings={identity:AgentRole;model:string;efforts:Record<string,string>;warning?:string};
export type AgentSettingsPatch={identity?:AgentRole;model?:string;effort?:{model:string;value:string}};
export type CodexConnection={available:boolean;provider:{id:string;name:string};auth:"authenticated"|"required"|"external"|"unknown";authMode:string;defaultModel:string;defaultEffort:string;models:{id:string;name:string;images:boolean;efforts:string[];defaultEffort:string;isDefault?:boolean}[];catalogAvailable:boolean;checkedAt:number;error?:string;lastRequest?:{model:string;name:string;provider:string;state:"running"|"succeeded"|"failed"|"cancelled";at:number}};
export type AgentMessage={id:string;role:"user"|"assistant";identity?:AgentRole;skill?:string;model?:AgentModel;content:string;page:string;selection:DomSelection|null;state?:string;startedAt?:number;completedAt?:number;activity?:AgentActivity[]};
export type AgentProposal={summary:string;html:string;spec:Spec;css:Record<string,string>;controls?:AgentControl[];changes:{path:string;before:string|null;after:string}[];interactions?:Interaction[];documentation?:string;reviewHtml?:string;candidate?:string;page?:string;impact?:{shared:string[];candidates:string[]}};

export type CanvasCapture={html:string;width:number;height:number;page:string;state:Record<string,unknown>};
export type PreviewConfig={scenario:Scenario;candidate:string;page?:string;pages?:string[];session?:string;initialState?:Record<string,unknown>;navigation?:{pageStatePath:string};spec:Spec;css:Record<string,string>;pick:boolean;locate?:string;instance?:string;annotations?:Annotation[];showAnnotations?:boolean;inspectDomId?:string;locateNonce?:number};
export type AgentJob={id:string;state:string;role?:AgentRole;skill?:string;identity?:AgentRole;page?:string;startedAt?:number;error?:string;summary?:string;messages?:AgentMessage[];proposal?:AgentProposal};
export type AgentSession={messages:AgentMessage[];identity?:AgentRole;model?:string;efforts?:Record<string,string>;warning?:string};
