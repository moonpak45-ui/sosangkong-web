import { ReactNode } from "react";

interface IconCircleProps {
  children: ReactNode;
  size?: number;
}

export default function IconCircle({ children, size = 44 }: IconCircleProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-accent-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}
