import { HTMLAttributes, ReactNode } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export default function Badge({ children, style, ...rest }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 8px",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-accent-bg)",
        color: "var(--color-accent)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
