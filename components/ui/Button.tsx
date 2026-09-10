"use client";

import { ButtonHTMLAttributes, ReactNode, useState } from "react";

type ButtonVariant = "primary" | "secondary" | "outline-light";
type ButtonSize = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 500,
    fontSize: size === "md" ? 14 : 13,
    padding: size === "md" ? "12px 20px" : "8px 14px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    border: "1px solid transparent",
    transition: "opacity 0.15s ease, background 0.15s ease",
  };

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: "var(--color-primary)",
      color: "var(--color-on-primary)",
    },
    secondary: {
      background: "transparent",
      color: "var(--color-text)",
      borderColor: "var(--color-border-strong)",
    },
    "outline-light": {
      background: hovered ? "rgba(255,255,255,0.1)" : "transparent",
      color: "var(--color-on-primary)",
      borderColor: "rgba(255,255,255,0.6)",
    },
  };

  return (
    <button
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
