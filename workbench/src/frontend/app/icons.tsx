export type Panel = "docs" | "agent" | "tools";
export function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6L18 18M6 18L18 6"/></svg>;
}
export function ToolIcon({view}:{view:Panel}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {view==="docs"?<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>:view==="tools"?<><path d="M4 7h6m5 0h5M4 17h10m5 0h1"/><circle cx="12.5" cy="7" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/></>:<><rect x="5" y="7" width="14" height="13" rx="3"/><path d="M12 3v4M2 11v5m20-5v5M9 16h6"/><circle cx="9" cy="12" r=".75"/><circle cx="15" cy="12" r=".75"/></>}
  </svg>;
}
export function WorkspaceStatusIcon({kind}:{kind:"local"|"offline"|"proposal"}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind==="local"?<><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8m-4-5v5"/></>:kind==="offline"?<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/></>:<><path d="M12 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M8 8h8m-8 4h3"/><circle cx="16" cy="16" r="3.5"/><path d="m18.5 18.5 2.5 2.5"/></>}
  </svg>;
}
export function CanvasToolIcon({tool}:{tool:"annotations"|"reset"|"compare"|"export"}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {tool==="annotations"?<><path d="M21 14a3 3 0 0 1-3 3H9l-6 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z"/><path d="M7 8h10M7 12h6"/></>:tool==="reset"?<path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7"/>:tool==="compare"?<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M6.5 9h2M6.5 13h2M15.5 9h2M15.5 13h2"/></>:<path d="M12 3v12m-4-4 4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>}
  </svg>;
}
