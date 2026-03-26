import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[1.1rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)] p-6 shadow-[0_8px_20px_rgba(15,23,42,0.03)] backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
