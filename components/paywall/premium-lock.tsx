import Link from "next/link";

export function PremiumLock({
  title = "Utvidet tilgang",
  description = "Få mer komplett innsyn i historikk, roller og analyseblokker.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-6">
      <p className="data-label text-[11px] font-semibold uppercase text-slate-500">{title}</p>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">{description}</p>
      <Link href="/pricing" className="mt-5 inline-flex rounded-full bg-[#182535] px-5 py-3 text-sm font-semibold text-white">
        Se tilgangsnivåer
      </Link>
    </div>
  );
}
