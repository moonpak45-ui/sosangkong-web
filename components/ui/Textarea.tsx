"use client";

import { TextareaHTMLAttributes, useState } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  errorMessage?: string;
}

export default function Textarea({
  error,
  errorMessage,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextareaProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error || errorMessage);

  const borderColor = hasError
    ? "#B3261E"
    : focused
    ? "var(--color-primary)"
    : "var(--color-border)";

  return (
    <>
      <textarea
        style={{
          width: "100%",
          minHeight: 80,
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-sm)",
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          color: "var(--color-text)",
          background: "var(--color-surface)",
          outline: "none",
          resize: "vertical",
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
      />
      {errorMessage && (
        <div style={{ marginTop: 4, fontSize: 12, color: "#B3261E" }}>{errorMessage}</div>
      )}
    </>
  );
}
