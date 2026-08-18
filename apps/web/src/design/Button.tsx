import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
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
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps | "href"> & {
    to?: undefined;
    href?: undefined;
  };

type ButtonAsLink = ButtonOwnProps & {
  to: string;
  href?: undefined;
  disabled?: boolean;
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
  title?: string;
  style?: CSSProperties;
};

type ButtonAsAnchor = ButtonOwnProps & {
  href: string;
  to?: undefined;
  disabled?: boolean;
  target?: string;
  rel?: string;
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
  title?: string;
  style?: CSSProperties;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink | ButtonAsAnchor;

const OWN_KEYS = new Set([
  "variant",
  "size",
  "end",
  "loading",
  "className",
  "children",
  "to",
  "href",
]);

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
    const { to, disabled, onClick, title, children, style } = props;
    if (disabled || loading) {
      return (
        <span className={cls} aria-disabled="true" title={title} style={style}>
          {loading ? <ButtonSpinner /> : null}
          {children}
        </span>
      );
    }
    return (
      <Link className={cls} to={to} onClick={onClick} title={title} style={style}>
        {children}
      </Link>
    );
  }

  if (props.href !== undefined) {
    const { href, disabled, onClick, title, target, rel, children, style } = props;
    if (disabled || loading) {
      return (
        <span className={cls} aria-disabled="true" title={title} style={style}>
          {loading ? <ButtonSpinner /> : null}
          {children}
        </span>
      );
    }
    return (
      <a
        className={cls}
        href={href}
        onClick={onClick}
        title={title}
        target={target}
        rel={rel}
        style={style}
      >
        {children}
      </a>
    );
  }

  const buttonProps = props as ButtonAsButton;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(buttonProps)) {
    if (!OWN_KEYS.has(key) && key !== "type" && key !== "disabled") {
      rest[key] = value;
    }
  }
  const { children, type = "button", disabled } = buttonProps;

  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? (
        <ButtonSpinner dark={variant === "default" || variant === "secondary" || variant === "ghost"} />
      ) : null}
      {children}
    </button>
  );
}
