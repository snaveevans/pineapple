import type { ReactNode } from "react";

export function Toolbar({
  children,
  end,
  className,
}: {
  children: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `hf-toolbar ${className}` : "hf-toolbar"}>
      {children}
      {end !== undefined && end !== null ? <div className="hf-toolbar-end">{end}</div> : null}
    </div>
  );
}
