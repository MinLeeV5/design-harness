import {defineRegistry} from "@json-render/react";
import {catalog} from "./catalog";
import {Button,Surface} from "./components";
export const components={
  Button:({props,emit}:import("@json-render/react").BaseComponentProps<{label:string;disabled:boolean|null}>)=><Button disabled={props.disabled??false} onClick={()=>emit("press")}>{props.label}</Button>,
  Surface:({children}:import("@json-render/react").BaseComponentProps)=><Surface>{children}</Surface>
};
export const {registry}=defineRegistry(catalog,{components});
