import {useEffect,useRef,useState,type KeyboardEvent,type ReactNode} from "react";
import {flushSync} from "react-dom";
import {Select as ListSelect} from "@base-ui/react/select";
import {Combobox} from "@base-ui/react/combobox";
import "./select.css";

export type SelectOption={value:string;label:string;description?:string;disabled?:boolean;icon?:ReactNode;keywords?:string};
type Props={label:string;value:string;options:SelectOption[];onValueChange:(value:string)=>void;disabled?:boolean;searchable?:boolean;variant?:"field"|"toolbar";icon?:ReactNode;displayValue?:string;title?:string;className?:string};
function Chevron(){return <svg className="wb-select-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function Check(){return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
function OptionContent({option,indicator}:{option:SelectOption;indicator:ReactNode}){return <><span className="wb-select-option-content">{option.icon&&<span className="wb-select-option-icon" aria-hidden="true">{option.icon}</span>}<span className="wb-select-option-copy"><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</span></span>{indicator}</>;}

// The controlled value belongs to the feature. Highlighting and filtering never commit it.
export function Select({label,value,options,onValueChange,disabled=false,searchable,variant="field",icon,displayValue,title,className=""}:Props){
  const [open,setOpen]=useState(false),triggerRef=useRef<HTMLButtonElement>(null),leavingWithTab=useRef(false),search=searchable??options.length>=6,selected=options.find(option=>option.value===value);
  function changeOpen(next:boolean){if(next)leavingWithTab.current=false;setOpen(next);}
  // Anchor native Tab traversal before removing the currently focused popup item.
  function keyDown(event:KeyboardEvent){if(open&&event.key==="Tab"){leavingWithTab.current=true;flushSync(()=>setOpen(false));triggerRef.current?.focus({preventScroll:true});}}
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  const trigger={ref:triggerRef,"aria-label":label,"data-value":value,"data-workbench-select":"",className:["wb-select-trigger","wb-select-"+variant,className].filter(Boolean).join(" "),title:title??selected?.label??label,onKeyDownCapture:keyDown};
  const content=<>{icon&&<span className="wb-select-trigger-icon" aria-hidden="true">{icon}</span>}<span className="wb-select-value">{displayValue??selected?.label??"请选择"}</span>{variant==="field"&&<Chevron/>}</>;
  const change=(next:string|null)=>{const option=options.find(item=>item.value===next);if(option&&!option.disabled)onValueChange(option.value);};
  const popupProps={className:"wb-select-popup","data-workbench-select-popup":"","aria-label":label+"选项",onKeyDownCapture:keyDown,finalFocus:leavingWithTab.current?false:undefined};
  if(search)return <Combobox.Root<SelectOption> items={options} value={selected??null} disabled={disabled} open={open} onOpenChange={changeOpen} onValueChange={option=>change(option?.value??null)} isItemEqualToValue={(a,b)=>a.value===b.value} autoHighlight filter={(option,query)=>[option.label,option.value,option.description,option.keywords].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())}>
    <Combobox.Trigger {...trigger}>{content}</Combobox.Trigger>
    <Combobox.Portal><Combobox.Positioner className="wb-select-positioner" sideOffset={7} align="start" collisionPadding={10}><Combobox.Popup {...popupProps}>
      <div className="wb-select-heading">{label}</div><div className="wb-select-search"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><Combobox.Input aria-label={"搜索"+label} placeholder={"搜索"+label+"…"}/></div>
      <Combobox.Empty className="wb-select-empty">没有匹配的选项，换个关键词试试</Combobox.Empty>
      <Combobox.List className="wb-select-list">{(option:SelectOption)=><Combobox.Item className="wb-select-option" key={option.value} value={option} disabled={option.disabled} data-value={option.value}><OptionContent option={option} indicator={<Combobox.ItemIndicator className="wb-select-check"><Check/></Combobox.ItemIndicator>}/></Combobox.Item>}</Combobox.List>
    </Combobox.Popup></Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
  return <ListSelect.Root<string> items={options} value={value} disabled={disabled} open={open} onOpenChange={changeOpen} onValueChange={change} modal={false}>
    <ListSelect.Trigger {...trigger}>{content}</ListSelect.Trigger>
    <ListSelect.Portal><ListSelect.Positioner className="wb-select-positioner" sideOffset={7} align="start" alignItemWithTrigger={false} collisionPadding={10}><ListSelect.Popup {...popupProps}>
      <div className="wb-select-heading">{label}</div><ListSelect.List className="wb-select-list">{options.map(option=><ListSelect.Item className="wb-select-option" key={option.value} value={option.value} disabled={option.disabled} data-value={option.value}><OptionContent option={option} indicator={<ListSelect.ItemIndicator className="wb-select-check"><Check/></ListSelect.ItemIndicator>}/></ListSelect.Item>)}</ListSelect.List>
    </ListSelect.Popup></ListSelect.Positioner></ListSelect.Portal>
  </ListSelect.Root>;
}
