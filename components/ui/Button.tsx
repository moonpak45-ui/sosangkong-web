import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";
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
  ...rest
}: ButtonProps) {
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
    transition: "opacity 0.15s ease",
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
  };

  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}
