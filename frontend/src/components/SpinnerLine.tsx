import type { ReactNode } from "react";

export function SpinnerLine({ children }: { children: ReactNode }) {
  return (
    <div className="spinner-line" role="status">
      <span className="spinner-dot" />
      {children}
    </div>
  );
}
