import type {ReactNode} from "react";

export type IconName="pick"|"image"|"image-off"|"interaction"|"visual"|"provider"|"send"|"stop"|"close"|"refresh"|"copy"|"plus"|"bottom"|"approval"|"status-idle"|"status-success"|"status-cancelled"|"status-failed"|"status-reply"|"permission-read"|"permission-proposal"|"permission-full";
export function AgentIcon({name}:{name:IconName}){
  const paths:Record<IconName,ReactNode>={
    pick:<><path d="m5 3 14 9-7 1-3 7Z"/><path d="m12 13 4 6"/></>,
    image:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
    "image-off":<><path d="m3 3 18 18M9 3h8a4 4 0 0 1 4 4v8M3 9v8a4 4 0 0 0 4 4h8M3 17l5-5m8-2 5 7"/></>,
    interaction:<><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/><path d="M6 9v6m3-9h5a4 4 0 0 1 4 4v5m-3-3 3 3 3-3"/></>,
    visual:<><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.8-4.2 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3A8.3 8.3 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="10" cy="6.8" r=".8" fill="currentColor" stroke="none"/><circle cx="14.3" cy="7" r=".8" fill="currentColor" stroke="none"/></>,
    "permission-read":<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    "permission-proposal":<><path d="m12 3 8 3v6c0 4.5-4 7.5-8 9-4-1.5-8-4.5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    "permission-full":<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V7a4 4 0 0 1 7.5-2M12 14v3"/></>,
    provider:<><path d="M8 2v5m8-5v5M6 7h12v3a6 6 0 0 1-12 0Zm6 9v6"/></>,
    send:<path d="M12 20V4m-6 6 6-6 6 6"/>,
    bottom:<path d="M12 3v14m-5-5 5 5 5-5M5 21h14"/>,
    approval:<><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></>,
    "status-idle":<><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></>,
    "status-success":<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    "status-cancelled":<><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,
    "status-failed":<><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m-6 0 6-6"/></>,
    "status-reply":<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/>,
    stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    copy:<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    refresh:<><path d="M20 8a8 8 0 1 0 0 8"/><path d="M20 3v5h-5"/></>,
    plus:<path d="M12 5v14M5 12h14"/>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
