import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

export type ButtonVariant = "default" | "primary" | "secondary" | "ghost" | "brand";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  end?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & {
    to?: undefined;
    href?: undefined;
  };

type ButtonAsLink = ButtonOwnProps & {
  to: string;
  href?: undefined;
  disabled?: boolean;
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
  title?: string;
};

type ButtonAsAnchor = ButtonOwnProps & {
  href: string;
  to?: undefined;
  disabled?: boolean;
  target?: string;
  rel?: string;
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
  title?: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink | ButtonAsAnchor;

function buttonClassName({
  variant = "default",
  size = "md",
  end = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  end?: boolean;
  className?: string | undefined;
}): string {
  const parts = ["hf-btn"];
  if (variant !== "default") parts.push(`hf-btn-${variant}`);
  if (size !== "md") parts.push(`hf-btn-${size}`);
  if (end) parts.push("hf-btn-end");
  if (className) parts.push(className);
  return parts.join(" ");
}

export function ButtonSpinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={dark ? "hf-btn-spinner hf-btn-spinner-dark" : "hf-btn-spinner"}
      aria-hidden
    />
  );
}

export function Button(props: ButtonProps) {
  const variant = props.variant ?? "default";
  const size = props.size ?? "md";
  const end = props.end ?? false;
  const loading = props.loading ?? false;
  const cls = buttonClassName({
    variant,
    size,
    end,
    ...(props.className !== undefined ? { className: props.className } : {}),
  });

  if (props.to !== undefined) {
    const { to, disabled, onClick, title, children } = props;
    if (disabled || loading) {
      return (
        <span className={cls} aria-disabled="true" title={title}>
          {loading ? <ButtonSpinner /> : null}
          {children}
        </span>
      );
    }
    return (
      <Link className={cls} to={to} onClick={onClick} title={title}>
        {children}
      </Link>
    );
  }

  if (props.href !== undefined) {
    const { href, disabled, onClick, title, target, rel, children } = props;
    if (disabled || loading) {
      return (
        <span className={cls} aria-disabled="true" title={title}>
          {loading ? <ButtonSpinner /> : null}
          {children}
        </span>
      );
    }
    return (
      <a className={cls} href={href} onClick={onClick} title={title} target={target} rel={rel}>
        {children}
      </a>
    );
  }

  const {
    children,
    type = "button",
    disabled,
    onClick,
    title,
    form,
    name,
    value,
    autoFocus,
    tabIndex,
    id,
    "aria-label": ariaLabel,
    "aria-pressed": ariaPressed,
    "aria-busy": ariaBusy,
  } = props;

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      form={form}
      name={name}
      value={value}
      autoFocus={autoFocus}
      tabIndex={tabIndex}
      id={id}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-busy={ariaBusy}
    >
      {loading ? (
        <ButtonSpinner dark={variant === "default" || variant === "secondary" || variant === "ghost"} />
      ) : null}
      {children}
    </button>
  );
}
