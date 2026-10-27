import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
export function Button({children, ...props}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} style={{minHeight:"var(--button-height)", border:0,
    borderRadius:8, padding:"8px 18px", background:"var(--color-primary)", color:"#fff", ...props.style}}>{children}</button>;
}
export function Surface({children}: PropsWithChildren) {
  return <section className="product-surface">{children}</section>;
}
