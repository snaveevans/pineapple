import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export type EmptyStateTone = "default" | "bad" | "brand";
export type EmptyStateVariant = "default" | "inline" | "panel";

export function EmptyState({
  icon,
  iconTone = "default",
  title,
  description,
  action,
  children,
  spinner = false,
  variant = "default",
  className,
  role,
}: {
  icon?: IconName;
  iconTone?: EmptyStateTone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  spinner?: boolean;
  variant?: EmptyStateVariant;
  className?: string;
  role?: string;
}) {
  const parts = ["hf-empty"];
  if (variant === "inline") parts.push("hf-empty-inline");
  if (variant === "panel") parts.push("hf-empty-panel");
  if (className) parts.push(className);

  const body = action ?? children;

  return (
    <div className={parts.join(" ")} role={role}>
      {spinner ? (
        <span className="hf-empty-spinner" aria-hidden />
      ) : icon !== undefined ? (
        <div
          className="hf-empty-icon"
          data-tone={iconTone === "default" ? undefined : iconTone}
        >
          <Icon name={icon} size={iconTone === "brand" ? 26 : 24} stroke={1.8} />
        </div>
      ) : null}
      <h2 className="hf-empty-title">{title}</h2>
      {description !== undefined && description !== null && description !== false ? (
        <div className="hf-empty-sub">{description}</div>
      ) : null}
      {body !== undefined && body !== null ? body : null}
    </div>
  );
}

export function EmptyStateActions({ children }: { children: ReactNode }) {
  return <div className="hf-empty-actions">{children}</div>;
}
