"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUpRight, CalendarClock, Check, ChevronDown, LoaderCircle, Search } from "lucide-react";

import { AnnouncementDiscussionPanel } from "@/components/company/announcement-discussion-panel";
import { Card } from "@/components/ui/card";
import { NormalizedAnnouncement, NormalizedAnnouncementDetail } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type AnnouncementTimelineProps = {
  companyName: string;
  companySlug: string;
  announcements: NormalizedAnnouncement[];
  availabilityMessage: string;
  available: boolean;
  allAnnouncementsUrl?: string | null;
  initialDetail?: NormalizedAnnouncementDetail | null;
  discussionRoomId?: string | null;
  discussionRoomName?: string | null;
};

function formatDetailDate(value?: Date | string | null) {
  return value ? formatDate(value) : "Dato ikke oppgitt";
}

function toIsoDateParam(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function getAnnouncementType(announcement: NormalizedAnnouncement) {
  return announcement.title.trim() || "Ukjent type";
}

function toSortableTimestamp(value?: Date | string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function compareAnnouncements(left: NormalizedAnnouncement, right: NormalizedAnnouncement) {
  const leftHasDate = Boolean(left.publishedAt);
  const rightHasDate = Boolean(right.publishedAt);

  if (!leftHasDate && rightHasDate) {
    return 1;
  }

  if (leftHasDate && !rightHasDate) {
    return -1;
  }

  const rightTimestamp = toSortableTimestamp(right.publishedAt);
  const leftTimestamp = toSortableTimestamp(left.publishedAt);
  if (rightTimestamp !== leftTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return left.title.localeCompare(right.title, "nb-NO");
}

function getTimelineGroupKey(announcement: NormalizedAnnouncement) {
  return announcement.year ? String(announcement.year) : "Før tidslinjen";
}

export function CompanyAnnouncementsTimeline({
  companyName,
  companySlug,
  announcements,
  availabilityMessage,
  available,
  allAnnouncementsUrl,
  initialDetail,
  discussionRoomId,
  discussionRoomName,
}: AnnouncementTimelineProps) {
  const sortedAnnouncements = useMemo(
    () => [...announcements].sort(compareAnnouncements),
    [announcements],
  );
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeYear, setActiveYear] = useState<number | "alle">("alle");
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(sortedAnnouncements[0]?.id ?? null);
  const [detailCache, setDetailCache] = useState<Record<string, NormalizedAnnouncementDetail>>(
    initialDetail ? { [initialDetail.id]: initialDetail } : {},
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const inFlightRequests = useRef<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const years = useMemo(
    () =>
      Array.from(new Set(sortedAnnouncements.map((announcement) => announcement.year).filter(Boolean) as number[])).sort(
        (left, right) => right - left,
      ),
    [sortedAnnouncements],
  );

  const types = useMemo(
    () =>
      Array.from(new Set(sortedAnnouncements.map(getAnnouncementType))).sort((left, right) =>
        left.localeCompare(right, "nb-NO"),
      ),
    [sortedAnnouncements],
  );

  const filteredAnnouncements = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return sortedAnnouncements.filter((announcement) => {
      if (activeYear !== "alle" && announcement.year !== activeYear) {
        return false;
      }

      if (activeTypes.length > 0 && !activeTypes.includes(getAnnouncementType(announcement))) {
        return false;
      }

      if (query && !announcement.title.toLowerCase().includes(query)) {
        return false;
      }

      return true;
    });
  }, [activeTypes, activeYear, deferredSearch, sortedAnnouncements]);

  useEffect(() => {
    if (!typeDropdownOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setTypeDropdownOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [typeDropdownOpen]);

  useEffect(() => {
    if (!selectedId || filteredAnnouncements.some((announcement) => announcement.id === selectedId)) {
      return;
    }

    setSelectedId(filteredAnnouncements[0]?.id ?? sortedAnnouncements[0]?.id ?? null);
  }, [filteredAnnouncements, selectedId, sortedAnnouncements]);

  const groupedAnnouncements = useMemo(() => {
    const grouped = new Map<string, NormalizedAnnouncement[]>();

    for (const announcement of filteredAnnouncements) {
      const key = getTimelineGroupKey(announcement);
      const current = grouped.get(key) ?? [];
      current.push(announcement);
      grouped.set(key, current);
    }

    const entries = Array.from(grouped.entries());
    const undatedEntry = entries.find(([key]) => key === "Før tidslinjen");
    const datedEntries = entries
      .filter(([key]) => key !== "Før tidslinjen")
      .sort((left, right) => Number(right[0]) - Number(left[0]));

    return [...datedEntries, undatedEntry]
      .filter((entry): entry is [string, NormalizedAnnouncement[]] => Boolean(entry))
      .map(([year, items]) => ({
        year,
        items,
      }));
  }, [filteredAnnouncements]);

  const selectedAnnouncement =
    filteredAnnouncements.find((announcement) => announcement.id === selectedId) ??
    sortedAnnouncements.find((announcement) => announcement.id === selectedId) ??
    null;

  const fetchAnnouncementDetail = useCallback(
    async (
      announcement: NormalizedAnnouncement,
      options?: {
        showLoading?: boolean;
        resetError?: boolean;
      },
    ) => {
      if (detailCache[announcement.id] || inFlightRequests.current.has(announcement.id)) {
        return;
      }

      inFlightRequests.current.add(announcement.id);

      if (options?.showLoading) {
        setLoadingId(announcement.id);
      }

      if (options?.resetError) {
        setDetailError(null);
      }

      try {
        const response = await fetch(
          `/api/companies/${companySlug}/announcements/${announcement.id}?publishedAt=${encodeURIComponent(
            toIsoDateParam(announcement.publishedAt),
          )}`,
        );

        if (!response.ok) {
          throw new Error("Klarte ikke å åpne kunngjøringen.");
        }

        const payload = (await response.json()) as { data: NormalizedAnnouncementDetail };
        startTransition(() => {
          setDetailCache((current) => ({
            ...current,
            [announcement.id]: payload.data,
          }));
        });
      } catch (error) {
        if (options?.showLoading) {
          setDetailError(error instanceof Error ? error.message : "Klarte ikke å åpne kunngjøringen.");
        }
      } finally {
        inFlightRequests.current.delete(announcement.id);
        if (options?.showLoading) {
          setLoadingId((current) => (current === announcement.id ? null : current));
        }
      }
    },
    [companySlug, detailCache],
  );

  useEffect(() => {
    if (!selectedAnnouncement || detailCache[selectedAnnouncement.id]) {
      return;
    }

    void fetchAnnouncementDetail(selectedAnnouncement, { showLoading: true, resetError: true });
  }, [selectedAnnouncement, detailCache, fetchAnnouncementDetail]);

  useEffect(() => {
    const candidates = filteredAnnouncements
      .filter((announcement) => !detailCache[announcement.id])
      .slice(0, 4);

    if (candidates.length === 0) {
      return;
    }

    const timers = candidates.map((announcement, index) =>
      setTimeout(() => {
        void fetchAnnouncementDetail(announcement);
      }, 120 * (index + 1)),
    );

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [filteredAnnouncements, detailCache, fetchAnnouncementDetail]);

  const selectedDetail = selectedAnnouncement ? detailCache[selectedAnnouncement.id] ?? null : null;
  const datedAnnouncements = sortedAnnouncements.filter((announcement) => Boolean(announcement.publishedAt));
  const latestAnnouncement = datedAnnouncements[0] ?? null;
  const oldestAnnouncement = datedAnnouncements.at(-1) ?? null;
  const distinctTypes = types.length;
  const selectedTypeLabel =
    activeTypes.length === 0 ? "Alle typer" : activeTypes.length === 1 ? activeTypes[0] : `${activeTypes.length} valgt`;

  function toggleAnnouncementType(type: string) {
    setActiveTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
      <div className="space-y-6">
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-5 border-b border-[rgba(15,23,42,0.08)] pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.9)] px-3 py-1 text-[11px] font-semibold uppercase text-slate-500">
                  Kunngjøringer
                </span>
                <span
                  className={cn(
                    "data-label rounded-full border px-3 py-1 text-[11px] font-semibold uppercase",
                    available
                      ? "border-[rgba(52,101,77,0.14)] bg-[rgba(233,245,236,0.9)] text-[#36564a]"
                      : "border-[rgba(146,91,33,0.14)] bg-[rgba(255,246,236,0.9)] text-[#8a5b21]",
                  )}
                >
                  {available ? "Offisiell kilde aktiv" : "Delvis tilgjengelig"}
                </span>
              </div>
              <h2 className="mt-4 text-[2rem] font-semibold tracking-tight text-slate-950">
                Historikk for {companyName}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{availabilityMessage}</p>
            </div>
            {allAnnouncementsUrl ? (
              <a
                href={allAnnouncementsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
              >
                Åpne hos Brreg <ArrowUpRight className="size-4" />
              </a>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Registrerte hendelser
              </div>
              <div className="mt-2 text-[1.5rem] font-semibold tracking-tight text-slate-950">
                {sortedAnnouncements.length}
              </div>
            </div>
            <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Tidsrom
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {oldestAnnouncement?.year ?? "Før tidslinjen"} - {latestAnnouncement?.year ?? "Ukjent"}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Siste publisering {formatDetailDate(latestAnnouncement?.publishedAt)}
              </div>
            </div>
            <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Hendelsestyper
              </div>
              <div className="mt-2 text-[1.5rem] font-semibold tracking-tight text-slate-950">
                {distinctTypes}
              </div>
              <div className="mt-1 text-sm text-slate-600">Filtrer på type i panelet til høyre.</div>
            </div>
          </div>

          {sortedAnnouncements.length > 0 ? (
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Søk i kunngjøringer"
                  className="w-full rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-10 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[rgba(24,37,53,0.35)]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveYear("alle")}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-semibold transition",
                    activeYear === "alle"
                      ? "bg-[#182535] text-white"
                      : "border border-[rgba(15,23,42,0.12)] bg-white text-slate-600 hover:text-slate-900",
                  )}
                >
                  Alle år
                </button>
                {years.slice(0, 8).map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setActiveYear(year)}
                    className={cn(
                      "rounded-full px-3 py-2 text-xs font-semibold transition",
                      activeYear === year
                        ? "bg-[#182535] text-white"
                        : "border border-[rgba(15,23,42,0.12)] bg-white text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Tidslinje</div>
            <h3 className="mt-2 text-[1.55rem] font-semibold tracking-tight text-slate-950">
              Vertikal historikk med årstall og hendelser
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Klikk på et punkt for å åpne kunngjøringen. Hover og bakgrunnsprefetch gjør detaljene raskere å åpne.
            </p>
          </div>

          {groupedAnnouncements.length === 0 ? (
            <div className="mt-5 rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
              {sortedAnnouncements.length === 0
                ? "Brreg har ingen registrerte kunngjøringer for dette foretaket akkurat nå."
                : "Ingen kunngjøringer matcher gjeldende søk eller filtre."}
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              {groupedAnnouncements.map((group) => (
                <section key={group.year} className="grid gap-4 sm:grid-cols-[92px,minmax(0,1fr)] sm:gap-6">
                  <div className="sm:pt-1">
                    <div className="inline-flex rounded-full bg-[rgba(238,242,246,0.95)] px-3 py-1 text-xs font-semibold text-slate-600 sm:w-full sm:justify-center">
                      {group.year}
                    </div>
                    <div className="mt-2 text-center text-xs text-slate-500">{group.items.length} hendelser</div>
                  </div>

                  <div className="relative pl-8 before:absolute before:left-3 before:top-0 before:h-full before:w-px before:bg-[rgba(198,208,222,0.85)]">
                    <div className="space-y-4">
                      {group.items.map((announcement) => {
                        const isSelected = selectedAnnouncement?.id === announcement.id;
                        return (
                          <button
                            key={announcement.id}
                            type="button"
                            onClick={() => setSelectedId(announcement.id)}
                            onMouseEnter={() => void fetchAnnouncementDetail(announcement)}
                            onFocus={() => void fetchAnnouncementDetail(announcement)}
                            className={cn(
                              "group relative w-full rounded-[1rem] border px-5 py-4 text-left transition",
                              isSelected
                                ? "border-[#182535] bg-[rgba(249,250,251,0.96)] shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
                                : "border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] hover:border-[rgba(24,37,53,0.2)] hover:bg-white",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute left-[-1.95rem] top-6 size-3 rounded-full border-2 bg-white transition",
                                isSelected
                                  ? "border-[#2f5d9f] bg-[#2f5d9f] shadow-[0_0_0_6px_rgba(47,93,159,0.12)]"
                                  : "border-[rgba(47,93,159,0.55)] group-hover:border-[#2f5d9f]",
                              )}
                            />
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-500">
                                    {announcement.publishedAt ? formatDetailDate(announcement.publishedAt) : "Dato ikke oppgitt"}
                                  </span>
                                  <span className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-500">
                                    {getAnnouncementType(announcement)}
                                  </span>
                                  {isSelected ? (
                                    <span className="data-label rounded-full bg-[#182535] px-2.5 py-1 text-[11px] font-semibold uppercase text-white">
                                      Åpen
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-3 text-[1.15rem] font-semibold tracking-tight text-slate-950">
                                  {announcement.title}
                                </div>
                                <div className="mt-1 text-sm text-slate-600">
                                  Offisiell kunngjøring fra Brønnøysundregistrene
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-[#2f5d9f] transition group-hover:text-[#1f4578]">
                                Åpne detalj
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Filtrer</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Type kunngjøring</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Filtrer tidslinjen på kunngjøringstype uten å forlate detaljpanelet.
            </p>
          </div>

          <div className="mt-5" ref={dropdownRef}>
            <label className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Type
            </label>
            <div className="relative mt-2">
              <button
                type="button"
                onClick={() => setTypeDropdownOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-[0.95rem] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition hover:border-[rgba(24,37,53,0.22)]"
              >
                <span className="truncate">{selectedTypeLabel}</span>
                <ChevronDown
                  className={cn(
                    "size-4 text-slate-400 transition",
                    typeDropdownOpen ? "rotate-180" : "",
                  )}
                />
              </button>

              {typeDropdownOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                  <button
                    type="button"
                    onClick={() => setActiveTypes([])}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[0.75rem] px-3 py-2 text-left text-sm transition",
                      activeTypes.length === 0 ? "bg-[rgba(24,37,53,0.06)] text-slate-950" : "text-slate-600 hover:bg-[rgba(248,249,250,0.9)]",
                    )}
                  >
                    <span>Alle typer</span>
                    {activeTypes.length === 0 ? <Check className="size-4 text-[#2f5d9f]" /> : null}
                  </button>
                  <div className="my-2 border-t border-[rgba(15,23,42,0.06)]" />
                  <div className="max-h-64 overflow-y-auto">
                    {types.map((type) => {
                      const checked = activeTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleAnnouncementType(type)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-[0.75rem] px-3 py-2 text-left text-sm transition",
                            checked ? "bg-[rgba(24,37,53,0.06)] text-slate-950" : "text-slate-600 hover:bg-[rgba(248,249,250,0.9)]",
                          )}
                        >
                          <span className="pr-3">{type}</span>
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center rounded-[0.3rem] border",
                              checked
                                ? "border-[#2f5d9f] bg-[#2f5d9f] text-white"
                                : "border-[rgba(15,23,42,0.15)] bg-white text-transparent",
                            )}
                          >
                            <Check className="size-3" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Detaljpanel</div>
            <h3 className="mt-2 text-[1.35rem] font-semibold tracking-tight text-slate-950">Valgt kunngjøring</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Detaljene er forhåndslastet for valgt hendelse og prefetchet i bakgrunnen for raskere åpning.
            </p>
          </div>

          {!selectedAnnouncement ? (
            <div className="mt-5 rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-5 text-sm text-slate-600">
              Velg en hendelse i tidslinjen for å åpne detaljene.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{selectedAnnouncement.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-4" /> {formatDetailDate(selectedAnnouncement.publishedAt)}
                      </span>
                      {selectedDetail?.sourceLabel ? <span>· {selectedDetail.sourceLabel}</span> : null}
                    </div>
                  </div>
                  <a
                    href={selectedAnnouncement.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-slate-950"
                  >
                    Original <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
              </div>

              {loadingId === selectedAnnouncement.id && !selectedDetail ? (
                <div className="flex items-center gap-3 rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4 text-sm text-slate-600">
                  <LoaderCircle className="size-4 animate-spin text-[#2f5d9f]" />
                  Henter kunngjøring fra Brreg...
                </div>
              ) : null}

              {detailError && !selectedDetail ? (
                <div className="rounded-[0.95rem] border border-[rgba(146,91,33,0.16)] bg-[rgba(255,246,236,0.9)] p-4 text-sm leading-6 text-[#8a5b21]">
                  {detailError}
                </div>
              ) : null}

              {selectedDetail ? (
                <div className="max-h-[min(70vh,900px)] overflow-y-auto rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white">
                  <div
                    className={cn(
                      "p-4 text-sm leading-7 text-slate-700",
                      "[&_h3]:mb-4 [&_h3]:text-[1.1rem] [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-slate-950",
                      "[&_p]:mb-3 [&_strong]:font-semibold [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse",
                      "[&_td]:border-b [&_td]:border-[rgba(15,23,42,0.06)] [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top",
                      "[&_td:first-child]:w-[38%] [&_td:first-child]:font-medium [&_td:first-child]:text-slate-500",
                      "[&_tr:last-child_td]:border-b-0",
                    )}
                    dangerouslySetInnerHTML={{ __html: selectedDetail.contentHtml }}
                  />
                </div>
              ) : null}

              {discussionRoomId && discussionRoomName ? (
                <AnnouncementDiscussionPanel
                  roomId={discussionRoomId}
                  roomName={discussionRoomName}
                  announcement={selectedAnnouncement}
                />
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
