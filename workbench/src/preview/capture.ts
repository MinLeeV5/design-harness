// Copy rendered state, never execute the copied product scripts in the capture renderer.
export function captureDocument():string {
  if(!document.querySelector("[data-jr-key]"))throw new Error("页面尚未就绪，请等待加载后重试");
  const root=document.documentElement.cloneNode(true) as HTMLElement;
  const originals=[document.documentElement,...document.documentElement.querySelectorAll("*")],copies=[root,...root.querySelectorAll("*")];
  originals.forEach((node,index)=>{const copy=copies[index];if(!copy)return;
    if(node instanceof HTMLInputElement){copy.setAttribute("value",node.value);copy.toggleAttribute("checked",node.checked);}
    if(node instanceof HTMLTextAreaElement)copy.textContent=node.value;
    if(node instanceof HTMLOptionElement)copy.toggleAttribute("selected",node.selected);
    if(node instanceof HTMLElement){if(node.scrollTop)copy.setAttribute("data-dh-capture-top",String(node.scrollTop));if(node.scrollLeft)copy.setAttribute("data-dh-capture-left",String(node.scrollLeft));}
    if(node instanceof HTMLCanvasElement){try{const image=document.createElement("img");for(const attr of [...copy.attributes])image.setAttribute(attr.name,attr.value);image.src=node.toDataURL();const style=getComputedStyle(node);for(const property of style)image.style.setProperty(property,style.getPropertyValue(property));image.width=node.width;image.height=node.height;copy.replaceWith(image);}catch{/* A non-readable canvas is left as a blank canvas. */}}
    if(node instanceof HTMLDialogElement&&node.matches(":modal"))copy.setAttribute("data-dh-capture-modal","true");
    if(node.matches(":popover-open"))copy.setAttribute("data-dh-capture-popover","true");
  });
  root.querySelectorAll('script,iframe,object,embed,base,link,meta,[id^="dh-review-"],[id^="dh-capture-"]').forEach(node=>node.remove());
  for(const node of [root,...root.querySelectorAll("*")])for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||["srcdoc","autofocus"].includes(attr.name))node.removeAttribute(attr.name);
  root.setAttribute("data-dh-capture-scroll-y",String(scrollY));root.setAttribute("data-dh-capture-scroll-x",String(scrollX));
  return '<!doctype html>'+root.outerHTML;
}
