import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div className={className ? `hf-card ${className}` : "hf-card"} {...rest}>
      {children}
    </div>
  );
}
