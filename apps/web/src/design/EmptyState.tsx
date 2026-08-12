import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export type EmptyStateTone = "default" | "bad" | "brand";
/** Layout chrome. Metrics match the pre-extraction page styles. */
export type EmptyStateSurface =
  | "assets" // hf-assets-state (default)
  | "inline" // dashed filtered empty
  | "panel" // team bordered card
  | "quiet" // notifications
  | "history" // activity history dashed
  | "hero"; // maintenance empty (larger art)

const ICON_SIZE: Record<EmptyStateSurface, number> = {
  assets: 26,
  inline: 24,
  panel: 26,
  quiet: 22,
  history: 24,
  hero: 30,
};

export function EmptyState({
  icon,
  iconTone = "default",
  title,
  description,
  action,
  children,
  spinner = false,
  surface = "assets",
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
  surface?: EmptyStateSurface;
  className?: string;
  role?: string;
}) {
  const parts = ["hf-empty", `hf-empty--${surface}`];
  if (className) parts.push(className);

  const body = action ?? children;
  const tone = iconTone === "default" ? undefined : iconTone;
  // Brand art on hero/panel keeps the original filled square treatment.
  const resolvedTone =
    tone ?? (surface === "hero" || surface === "panel" ? "brand" : undefined);

  return (
    <div className={parts.join(" ")} role={role} data-surface={surface}>
      {spinner ? (
        <span className="hf-empty-spinner" aria-hidden />
      ) : icon !== undefined ? (
        <div className="hf-empty-icon" data-tone={resolvedTone}>
          <Icon name={icon} size={ICON_SIZE[surface]} stroke={surface === "quiet" ? 1.6 : 1.8} />
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
