import type { ComponentType } from "react";
export type Scenario = {
  id: string; page: string; title: string; state: Record<string, unknown>;
  annotations: {target: string; section: string}[];
};
export type PageProps = { scenario: Scenario; candidate: string };
export type PageComponent = ComponentType<PageProps>;
export type Control = { id: string; label: string; target: string; cssVar: string;
  type: "range"; min: number; max: number; step: number; default: number; unit: "px" | "" };
export type Candidate = { id: string; title: string; params: string; entries?: Record<string, string> };
export type Manifest = { schemaVersion: 1; id: string; title: string; foundationVersion: string;
  pages: {id:string; title:string; entry:string}[]; candidates: Candidate[];
  viewports: {id:string; title:string; width:number; height:number}[]; controls: Control[] };
export type BundleData = {manifest:Manifest; scenarios:Scenario[]; documentation:string;
  previews:Record<string,string>; params:Record<string,Record<string,number>>; hashes:Record<string,string>;
  revision:string; requirements:{id:string;title:string}[]; development:boolean; token?:string};
