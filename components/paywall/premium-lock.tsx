import Link from "next/link";

export function PremiumLock({ title = "Premium-funksjon", description = "Oppgrader for a se full historikk, alle roller og dypere innsikt." }: { title?: string; description?: string }) {
  return (
    <div className="rounded-[1.75rem] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">{title}</p>
      <p className="mt-2 max-w-xl text-sm text-ink/70">{description}</p>
      <Link href="/pricing" className="mt-4 inline-flex rounded-full bg-ember px-5 py-3 text-sm font-semibold text-white">Se abonnement</Link>
    </div>
  );
}