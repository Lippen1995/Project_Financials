import { Card } from "@/components/ui/card";

export function IpTabSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <Card key={index} className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-5 w-10 animate-pulse rounded bg-slate-200" />
          </Card>
        ))}
      </section>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </Card>
    </div>
  );
}
