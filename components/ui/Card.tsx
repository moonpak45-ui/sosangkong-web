import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "sm" | "md";
}

export default function Card({ children, padding = "md", style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: padding === "md" ? "16px" : "12px",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
