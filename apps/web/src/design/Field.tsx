import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

export function Field({
  label,
  htmlFor,
  required,
  optional,
  hint,
  error,
  sub,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const parts = ["hf-field"];
  if (error) parts.push("has-error");
  if (className) parts.push(className);

  return (
    <div className={parts.join(" ")}>
      <label className="hf-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="hf-field-req">*</span> : null}
        {optional ? <span className="hf-field-opt">optional</span> : null}
        {hint !== undefined && hint !== null && hint !== false ? (
          <span className="hf-field-hint">{hint}</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <span className="hf-field-error" role="alert">
          <Icon name="alert" size={12} stroke={2} />
          {error}
        </span>
      ) : sub !== undefined && sub !== null && sub !== false ? (
        <span className="hf-field-sub">{sub}</span>
      ) : null}
    </div>
  );
}

export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `hf-field-row ${className}` : "hf-field-row"}>{children}</div>;
}

export function FieldReqMark() {
  return <span className="hf-field-req">*</span>;
}
