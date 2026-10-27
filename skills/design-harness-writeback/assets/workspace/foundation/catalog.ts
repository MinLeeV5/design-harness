import {defineCatalog} from "@json-render/core";
import {schema} from "@json-render/react/schema";
import {z} from "zod";
export const componentDefinitions = {
  Button:{props:z.object({label:z.string(),disabled:z.boolean().nullable()}),description:"项目基础按钮"},
  Surface:{props:z.object({}),slots:["default"],description:"项目基础容器"}
};
export const catalog=defineCatalog(schema,{components:componentDefinitions,actions:{}});
