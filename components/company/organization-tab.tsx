"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowUpRight, Building2, ChevronDown, ChevronUp, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  buildOrganizationModel,
  getRoleSearchText,
  isKeyRole,
  OrganizationActor,
} from "@/lib/organization";
import { CompanyProfile } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type Bucket = "owners" | "board" | "management" | "authority" | "advisors" | "other";

const bucketLabels: Record<Bucket, string> = {
  owners: "Eiere",
  board: "Styre",
  management: "Ledelse",
  authority: "Signatur og prokura",
  advisors: "Revisor og regnskapsfører",
  other: "Andre roller",
};

const bucketClasses: Record<Bucket, string> = {
  owners: "border-[#D3E2F8] bg-[#F5F9FF] text-[#17407A]",
  board: "border-[#D8E6DD] bg-[#F5FBF7] text-[#24553A]",
  management: "border-[#E5DCCD] bg-[#FCF8F2] text-[#6D4D1F]",
  authority: "border-[#E5D4EC] bg-[#FBF7FD] text-[#68407D]",
  advisors: "border-[#DCE4EB] bg-[#F8FAFC] text-[#40586B]",
  other: "border-[#E6E7EA] bg-[#FAFAFB] text-[#535862]",
};

function Badge({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        muted ? "bg-[#F3F4F6] text-[#4B5565]" : "bg-[#EEF4FF] text-[#1D4F91]",
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-[#E8EDF2] pb-4">
      <h2 className="text-[1.28rem] font-semibold tracking-tight text-[#0F172A]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-[#667085]">{description}</p>
    </div>
  );
}

function actorKind(actor: OrganizationActor) {
  return actor.type === "company" ? "Selskap" : "Person";
}

function formatHoverList(actors: OrganizationActor[]) {
  if (actors.length === 0) {
    return "Ikke registrert";
  }

  return actors
    .map((actor) => `${actor.name}${actor.titles.length ? ` (${actor.titles.join(", ")})` : ""}`)
    .join(" · ");
}

export function OrganizationTab({ profile }: { profile: CompanyProfile }) {
  const model = useMemo(() => buildOrganizationModel(profile), [profile]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [showKeyOnly, setShowKeyOnly] = useState(true);
  const [highlightMulti, setHighlightMulti] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(model.actors[0]?.id ?? null);
  const [open, setOpen] = useState<Record<Bucket, boolean>>({
    owners: true,
    board: true,
    management: true,
    authority: true,
    advisors: true,
    other: false,
  });
  const [active, setActive] = useState<Record<Bucket, boolean>>({
    owners: true,
    board: true,
    management: true,
    authority: true,
    advisors: true,
    other: false,
  });

  const filteredActors = model.actors.filter((actor) => {
    if (!active[actor.primaryBucket]) return false;
    if (showKeyOnly && !isKeyRole(actor)) return false;
    if (
      deferredSearch.trim() &&
      !getRoleSearchText(actor).includes(deferredSearch.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const selected =
    filteredActors.find((actor) => actor.id === selectedId) ??
    model.actors.find((actor) => actor.id === selectedId) ??
    null;

  const hoverGroups = {
    owners: filteredActors.filter((actor) => actor.primaryBucket === "owners"),
    board: filteredActors.filter((actor) => actor.primaryBucket === "board"),
    management: filteredActors.filter((actor) => actor.primaryBucket === "management"),
    authority: filteredActors.filter((actor) => actor.primaryBucket === "authority"),
    advisors: filteredActors.filter((actor) => actor.primaryBucket === "advisors"),
    other: filteredActors.filter((actor) => actor.primaryBucket === "other"),
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),320px]">
      <div className="space-y-6">
        <Card className="border-[#E5EAF0] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-[#EEF2F6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#475467]">
                  Organisasjonsoversikt
                </span>
                <span className="rounded-full bg-[#0F172A] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                  {model.company.status}
                </span>
              </div>
              <h2 className="mt-3 text-[1.8rem] font-semibold tracking-tight text-[#0F172A]">
                {model.company.name}
              </h2>
              <p className="mt-1 text-sm text-[#667085]">
                Org.nr. {model.company.orgNumber} · {model.company.legalForm ?? "Foretak"}
              </p>
            </div>
            <div className="rounded-[1.3rem] border border-[#E7ECF1] bg-[#F8FAFC] px-4 py-3 text-xs text-[#667085]">
              <div>Formell selskapsinformasjon</div>
              <div className="mt-1">Sist oppdatert {formatDate(model.company.fetchedAt)}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.statusItems.map((item) => (
              <div key={item.label} className="border-b border-dashed border-[#E8EDF2] pb-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
                  {item.label}
                </div>
                <div className="mt-1 text-sm font-medium text-[#101828]">{item.value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-[#E5EAF0] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <SectionTitle
            title="Organisasjonskart"
            description="Kartet samler styring, fullmakter og eksterne funksjoner i én rolig analyseflate."
          />

          <div className="mt-5 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#667085]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Søk i personer, selskaper og roller"
                  className="w-full rounded-[1rem] border border-[#D7DEE7] bg-white px-10 py-2.5 text-sm text-[#101828] outline-none focus:border-[#98A2B3] focus:ring-2 focus:ring-[#D6E4FF]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowKeyOnly((value) => !value);
                    setActive((current) => ({ ...current, other: showKeyOnly }));
                  }}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-semibold transition",
                    showKeyOnly ? "bg-[#0F172A] text-white" : "border border-[#D5DCE5] text-[#344054]",
                  )}
                >
                  Vis nøkkelroller
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightMulti((value) => !value)}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-semibold transition",
                    highlightMulti
                      ? "bg-[#7C5420] text-white"
                      : "border border-[#D5DCE5] text-[#344054]",
                  )}
                >
                  Fremhev flere roller
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(bucketLabels) as Bucket[]).map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setActive((current) => ({ ...current, [bucket]: !current[bucket] }))}
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-semibold transition",
                    active[bucket]
                      ? bucketClasses[bucket]
                      : "border-[#D5DCE5] bg-white text-[#667085]",
                  )}
                >
                  {bucketLabels[bucket]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(Object.keys(bucketLabels) as Bucket[]).map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setOpen((current) => ({ ...current, [bucket]: !current[bucket] }))}
                  className="flex items-center justify-between rounded-[1rem] border border-[#E5EAF0] bg-[#FAFBFC] px-4 py-3 text-left hover:border-[#CBD5E1]"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#101828]">{bucketLabels[bucket]}</div>
                    <div className="text-xs text-[#667085]">
                      {hoverGroups[bucket].length} registrerte aktører
                    </div>
                  </div>
                  {open[bucket] ? (
                    <ChevronUp className="size-4 text-[#667085]" />
                  ) : (
                    <ChevronDown className="size-4 text-[#667085]" />
                  )}
                </button>
              ))}
            </div>

            <div className="relative overflow-hidden rounded-[1.6rem] border border-[#E7ECF1] bg-[radial-gradient(circle_at_top_left,#F8FBFF_0%,#FFFFFF_46%,#F9FBFC_100%)]">
              <div className="border-b border-[#EEF2F6] bg-white/85 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#667085] backdrop-blur">
                Hold over selskapsnoden for komplett rolleoversikt
              </div>
              <div className="flex min-h-[520px] items-center justify-center p-8">
                <div className="group relative w-full max-w-[420px]">
                  <Link href={`/companies/${model.company.orgNumber}?tab=organisasjon`} className="block">
                    <div className="rounded-[1.7rem] border border-[#0F172A] bg-[#0F172A] p-6 text-white shadow-[0_28px_70px_rgba(15,23,42,0.22)] transition group-hover:-translate-y-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xl font-semibold tracking-tight">{model.company.name}</div>
                          <div className="mt-2 text-sm text-white/72">
                            {model.company.legalForm ?? "Foretak"} · {model.company.orgNumber}
                          </div>
                        </div>
                        <Building2 className="mt-1 size-5 text-white/70" />
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white/14 px-2.5 py-1 text-[10px] font-semibold text-white">
                          {model.company.status}
                        </span>
                        <span className="rounded-full bg-white/14 px-2.5 py-1 text-[10px] font-semibold text-white">
                          {filteredActors.length} registrerte aktører
                        </span>
                      </div>
                      <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/68">
                        Hold over for roller og kontrollbilde
                      </div>
                    </div>
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-[520px] -translate-x-1/2 pt-4 group-hover:block">
                    <div className="rounded-[1.25rem] border border-[#D8E3F0] bg-white/97 p-5 shadow-[0_22px_50px_rgba(15,23,42,0.16)] backdrop-blur">
                      <div className="flex items-start justify-between gap-4 border-b border-[#E8EDF2] pb-4">
                        <div>
                          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[#667085]">
                            Rolleoversikt
                          </div>
                          <div className="mt-1 text-lg font-semibold text-[#101828]">
                            {model.company.name}
                          </div>
                        </div>
                        <div className="rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-semibold text-[#475467]">
                          {filteredActors.length} aktører
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {(Object.keys(bucketLabels) as Bucket[])
                          .filter((bucket) => open[bucket])
                          .map((bucket) => (
                            <div
                              key={bucket}
                              className="rounded-[1rem] border border-[#E7ECF1] bg-[#F8FAFC] p-3"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
                                {bucketLabels[bucket]}
                              </div>
                              <div className="mt-2 text-sm leading-6 text-[#344054]">
                                {formatHoverList(hoverGroups[bucket])}
                              </div>
                            </div>
                          ))}
                      </div>

                      {highlightMulti ? (
                        <div className="mt-4 rounded-[1rem] border border-[#E7D6C3] bg-[#FCF6EE] p-3 text-sm text-[#6F4D20]">
                          Flere roller:{" "}
                          {formatHoverList(filteredActors.filter((actor) => actor.hasMultipleRoles))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-[#E5EAF0] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <SectionTitle
            title="Rolleoversikt"
            description="Rollene er gruppert etter kontroll, styring, fullmakter og eksterne funksjoner."
          />
          {!profile.rolesAvailability.available ? (
            <div className="mt-5 rounded-[1rem] border border-[#F0D8C2] bg-[#FFF8F1] p-4 text-sm leading-6 text-[#8A4B14]">
              {profile.rolesAvailability.message}
            </div>
          ) : null}

          <div className="mt-5 space-y-5">
            <div className={cn("rounded-[1.4rem] border p-5", bucketClasses.owners)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">A. Eiere</h3>
                  <p className="mt-1 text-sm opacity-80">
                    Registrerte eiere vises bare når tilgjengelig kildegrunnlag faktisk inneholder dem.
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">
                  {model.ownerships.filter((item) => item.available).length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {model.ownerships.map((owner) => (
                  <div key={owner.id} className="rounded-[1rem] border border-white/70 bg-white/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#101828]">{owner.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge muted>{owner.entityType === "company" ? "Selskap" : "Person"}</Badge>
                          {owner.relation ? <Badge muted>{owner.relation}</Badge> : null}
                          {owner.share ? <Badge>{owner.share}</Badge> : null}
                        </div>
                      </div>
                      {owner.orgNumber ? (
                        <Link
                          href={`/companies/${owner.orgNumber}?tab=organisasjon`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#1F4C8F] hover:text-[#173B71]"
                        >
                          Åpne foretak <ArrowUpRight className="size-4" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn("rounded-[1.4rem] border p-5", bucketClasses.board)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">B. Styre og ledelse</h3>
                  <p className="mt-1 text-sm opacity-80">
                    Kombinerer styringsroller og viser hvor ansvar er samlet.
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">
                  {model.groupedActors.board.length + model.groupedActors.management.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {[...model.groupedActors.management, ...model.groupedActors.board].map((actor) => (
                  <button
                    key={actor.id}
                    type="button"
                    onClick={() => setSelectedId(actor.id)}
                    className="w-full rounded-[1rem] border border-white/70 bg-white/80 p-4 text-left hover:border-[#CBD5E1]"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#101828]">{actor.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {actor.titles.map((title) => (
                            <Badge key={title}>{title}</Badge>
                          ))}
                          <Badge muted>{actorKind(actor)}</Badge>
                          {actor.birthYear ? <Badge muted>F. {actor.birthYear}</Badge> : null}
                          {actor.hasMultipleRoles ? <Badge>Flere roller</Badge> : null}
                        </div>
                      </div>
                      <div className="text-sm text-[#667085]">
                        {actor.roles[0]?.fromDate
                          ? `Tiltredt ${formatDate(actor.roles[0].fromDate)}`
                          : "Tiltredelsesdato ikke oppgitt"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className={cn("rounded-[1.4rem] border p-5", bucketClasses.authority)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">C. Signatur og prokura</h3>
                  <p className="mt-1 text-sm opacity-80">
                    Fullmaktsinformasjon vises eksplisitt når kildegrunnlaget inneholder regler.
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">
                  {model.signatureRules.filter((item) => item.available).length +
                    model.procurationRules.filter((item) => item.available).length}
                </span>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1rem] border border-white/70 bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#764494]">
                    Signatur
                  </div>
                  <div className="mt-3 space-y-3">
                    {model.signatureRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-[0.95rem] border border-[#EBDDF2] bg-[#FBF7FD] p-3 text-sm text-[#43244F]"
                      >
                        {rule.text}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-white/70 bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#764494]">
                    Prokura
                  </div>
                  <div className="mt-3 space-y-3">
                    {model.procurationRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-[0.95rem] border border-[#EBDDF2] bg-[#FBF7FD] p-3 text-sm text-[#43244F]"
                      >
                        {rule.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={cn("rounded-[1.4rem] border p-5", bucketClasses.advisors)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">D. Revisor og regnskapsfører</h3>
                  <p className="mt-1 text-sm opacity-80">
                    Eksterne kontroll- og rapporteringsfunksjoner vises separat.
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">
                  {model.advisors.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {model.advisors.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-[#D5DCE5] bg-white/80 p-4 text-sm text-[#667085]">
                    Ingen revisor eller regnskapsfører er registrert i tilgjengelige rolldata.
                  </div>
                ) : (
                  model.advisors.map((advisor) => (
                    <div key={advisor.id} className="rounded-[1rem] border border-white/70 bg-white/80 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[#101828]">{advisor.name}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge>{advisor.role}</Badge>
                            <Badge muted>
                              {advisor.entityType === "company" ? "Organisasjon" : "Person"}
                            </Badge>
                            {advisor.approvalStatus ? <Badge muted>{advisor.approvalStatus}</Badge> : null}
                          </div>
                        </div>
                        {advisor.orgNumber ? (
                          <Link
                            href={`/companies/${advisor.orgNumber}?tab=organisasjon`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-[#476075] hover:text-[#2E475C]"
                          >
                            Org.nr. {advisor.orgNumber} <ArrowUpRight className="size-4" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={cn("rounded-[1.4rem] border p-5", bucketClasses.other)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">E. Andre registrerte roller</h3>
                  <p className="mt-1 text-sm opacity-80">
                    Lavere visuell prioritet, men tilgjengelig for fullstendig kontrollanalyse.
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">
                  {model.groupedActors.other.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {model.groupedActors.other.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-[#D5DCE5] bg-white/80 p-4 text-sm text-[#667085]">
                    Ingen andre registrerte roller ble funnet.
                  </div>
                ) : (
                  model.groupedActors.other.map((actor) => (
                    <button
                      key={actor.id}
                      type="button"
                      onClick={() => setSelectedId(actor.id)}
                      className="w-full rounded-[1rem] border border-white/70 bg-white/80 p-4 text-left hover:border-[#CBD5E1]"
                    >
                      <div className="text-sm font-semibold text-[#101828]">{actor.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {actor.titles.map((title) => (
                          <Badge key={title} muted>
                            {title}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-[#E5EAF0] bg-[#FBFCFD] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] xl:sticky xl:top-6">
          <SectionTitle
            title="Innsikt"
            description="Korte observasjoner som gjør det enklere å vurdere kontroll og ansvarsfordeling."
          />
          <div className="mt-5 space-y-3">
            {model.insights.map((insight) => (
              <div
                key={insight.id}
                className={cn(
                  "rounded-[1rem] border p-4",
                  insight.tone === "flag"
                    ? "border-[#F1D2D6] bg-[#FFF6F7]"
                    : insight.tone === "positive"
                      ? "border-[#D8E6DD] bg-[#F5FBF7]"
                      : "border-[#E5EAF0] bg-white",
                )}
              >
                <div className="text-sm font-semibold text-[#101828]">{insight.title}</div>
                <div className="mt-1 text-sm leading-6 text-[#667085]">{insight.description}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-[#E5EAF0] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <SectionTitle
            title="Detaljpanel"
            description="Klikk på en person eller et selskap for å samle roller og relasjoner i én flate."
          />
          {selected ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[1.25rem] border border-[#E7ECF1] bg-[#F8FAFC] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[#0F172A]">{selected.name}</div>
                    <div className="mt-1 text-sm text-[#667085]">
                      {actorKind(selected)}
                      {selected.orgNumber ? ` · ${selected.orgNumber}` : ""}
                    </div>
                  </div>
                  {selected.orgNumber ? (
                    <Link
                      href={`/companies/${selected.orgNumber}?tab=organisasjon`}
                      className="inline-flex items-center gap-1 rounded-full border border-[#D5DCE5] px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-white"
                    >
                      Åpne side <ArrowUpRight className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.titles.map((title) => (
                    <Badge key={title}>{title}</Badge>
                  ))}
                  {selected.birthYear ? <Badge muted>F. {selected.birthYear}</Badge> : null}
                  {selected.approvalStatus ? <Badge muted>{selected.approvalStatus}</Badge> : null}
                </div>
              </div>

              <div className="space-y-3">
                {selected.roles.map((role) => (
                  <div
                    key={`${selected.id}-${role.sourceId}-${role.title}`}
                    className="rounded-[1rem] border border-[#E7ECF1] bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#101828]">{role.title}</div>
                        <div className="mt-1 text-sm text-[#667085]">
                          {role.organization?.name ?? role.person.fullName}
                        </div>
                      </div>
                      <Badge muted>
                        {role.fromDate ? `Fra ${formatDate(role.fromDate)}` : "Dato ikke oppgitt"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[1rem] border border-dashed border-[#D5DCE5] bg-[#FAFBFC] p-4 text-sm text-[#667085]">
              Ingen node er valgt ennå.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
