import type {ReactNode} from "react";

export type IconName="pick"|"image"|"image-off"|"role"|"settings"|"provider"|"send"|"stop"|"close"|"refresh"|"copy"|"plus"|"permission-read"|"permission-proposal"|"permission-full";
export function AgentIcon({name}:{name:IconName}){
  const paths:Record<IconName,ReactNode>={
    pick:<><path d="m5 3 14 9-7 1-3 7Z"/><path d="m12 13 4 6"/></>,
    image:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
    "image-off":<><path d="m3 3 18 18M9 3h8a4 4 0 0 1 4 4v8M3 9v8a4 4 0 0 0 4 4h8M3 17l5-5m8-2 5 7"/></>,
    role:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><path d="m18 3 1 1m-1 3h3"/></>,
    settings:<><path d="m9.5 3-.7 2.3-2 .9-2.2-.5-2.5 4.3 1.6 1.8v2.4l-1.6 1.8 2.5 4.3 2.2-.5 2 .9.7 2.3h5l.7-2.3 2-.9 2.2.5 2.5-4.3-1.6-1.8v-2.4l1.6-1.8-2.5-4.3-2.2.5-2-.9-.7-2.3Z"/><circle cx="12" cy="13" r="3"/></>,
    "permission-read":<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    "permission-proposal":<><path d="m12 3 8 3v6c0 4.5-4 7.5-8 9-4-1.5-8-4.5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    "permission-full":<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V7a4 4 0 0 1 7.5-2M12 14v3"/></>,
    provider:<><path d="M8 2v5m8-5v5M6 7h12v3a6 6 0 0 1-12 0Zm6 9v6"/></>,
    send:<path d="M12 20V4m-6 6 6-6 6 6"/>,
    stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    copy:<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    refresh:<><path d="M20 8a8 8 0 1 0 0 8"/><path d="M20 3v5h-5"/></>,
    plus:<path d="M12 5v14M5 12h14"/>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
