import {parseArgs} from "node:util";

export function parseCommand(args,{strict=true}={}) {
  return parseArgs({args,strict,allowPositionals:true,options:{project:{type:"string"},title:{type:"string"},port:{type:"string",default:"4173"},out:{type:"string"},example:{type:"boolean",default:false},mode:{type:"string"},primary:{type:"string"},separate:{type:"boolean",default:false},preview:{type:"boolean",default:false},help:{type:"boolean",short:"h"},version:{type:"boolean",short:"v"}}});
}
