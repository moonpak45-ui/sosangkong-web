"use client";

import { SelectHTMLAttributes, useState } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  errorMessage?: string;
}

export default function Select({
  error,
  errorMessage,
  style,
  onFocus,
  onBlur,
  children,
  ...rest
}: SelectProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error || errorMessage);

  const borderColor = hasError
    ? "#B3261E"
    : focused
    ? "var(--color-primary)"
    : "var(--color-border)";

  return (
    <>
      <select
        style={{
          width: "100%",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-sm)",
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          color: "var(--color-text)",
          background: "var(--color-surface)",
          outline: "none",
          cursor: "pointer",
          transition: "border-color 0.15s ease",
          ...style,
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      >
        {children}
      </select>
      {errorMessage && (
        <div style={{ marginTop: 4, fontSize: 12, color: "#B3261E" }}>{errorMessage}</div>
      )}
    </>
  );
}
