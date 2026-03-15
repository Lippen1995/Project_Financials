import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-panel", className)}>{children}</div>;
}