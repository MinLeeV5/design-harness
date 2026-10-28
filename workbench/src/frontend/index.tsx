import {createRoot} from "react-dom/client";
import type {BundleData} from "../contracts/types";
import {App} from "./app/App";
import "./ui/scrollbars.css";

const data=(window as unknown as {__DH_DATA__:BundleData}).__DH_DATA__;
createRoot(document.getElementById("root")!).render(<App data={data}/>);
