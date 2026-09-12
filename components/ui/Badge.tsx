import { HTMLAttributes, ReactNode } from "react";

type BadgeVariant = "accent" | "success" | "neutral" | "danger";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: BadgeVariant;
}

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: "var(--color-accent-bg)", color: "var(--color-accent)" },
  success: { bg: "var(--color-success-bg)", color: "var(--color-success)" },
  neutral: { bg: "var(--color-neutral-tone-bg)", color: "var(--color-neutral-tone)" },
  danger: { bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
};

export default function Badge({ children, style, variant = "accent", ...rest }: BadgeProps) {
  const { bg, color } = VARIANT_COLORS[variant];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 8px",
        borderRadius: "var(--radius-sm)",
        background: bg,
        color: color,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
