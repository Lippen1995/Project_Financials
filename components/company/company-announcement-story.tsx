"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnnouncementDiscussionPanel } from "@/components/company/announcement-discussion-panel";
import {
  STORY_BUCKETS,
  type AnnouncementStory,
  type StoryAnnouncement,
  type StoryBucket,
  type StoryEra,
  type StoryEvent,
} from "@/lib/announcement-story";
import type { NormalizedAnnouncementDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type CompanyAnnouncementStoryProps = {
  companyName: string;
  companySlug: string;
  story: AnnouncementStory;
  availabilityMessage: string;
  available: boolean;
  allAnnouncementsUrl?: string | null;
  initialDetail?: NormalizedAnnouncementDetail | null;
  discussionRoomId?: string | null;
  discussionRoomName?: string | null;
};

function toIsoDateParam(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function countLabel(count: number) {
  return count === 1 ? "1 kunngjøring" : `${count} kunngjøringer`;
}

function matchesQuery(event: StoryEvent, query: string) {
  if (!query) return true;
  const haystack = [event.title, event.explain, ...event.children.map((child) => child.title)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * Narrows the story to what the reader asked for without renumbering the chapters — a filtered
 * "KAPITTEL 3" is still the third name period, not the third thing left on screen.
 */
function filterEras(eras: StoryEra[], query: string, buckets: StoryBucket[]): StoryEra[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized && buckets.length === 0) return eras;

  return eras
    .map((era) => {
      const events = era.events
        .map((event) => {
          const children =
            buckets.length > 0 && event.children.length > 0
              ? event.children.filter((child) => buckets.includes(child.bucket))
              : event.children;
          const keptByBucket =
            buckets.length === 0 ||
            (event.children.length > 0 ? children.length > 0 : buckets.includes(event.bucket));
          if (!keptByBucket) return null;
          return {
            ...event,
            children,
            announcementCount: children.length > 0 ? children.length : 1,
          } satisfies StoryEvent;
        })
        .filter((event): event is StoryEvent => event !== null)
        .filter((event) => matchesQuery(event, normalized));

      const total = events.reduce((sum, event) => sum + event.announcementCount, 0);
      return { ...era, events, countLabel: countLabel(total) } satisfies StoryEra;
    })
    .filter((era) => era.events.length > 0);
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--px-border-subtle)] pt-2.5">
      <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">{label}</div>
      <div className="mt-1.5 text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--px-text)]">
        {value}
      </div>
    </div>
  );
}

function ChildRow({ item, onOpen }: { item: StoryAnnouncement; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-2 border-b border-[var(--px-border-subtle)] px-2 py-2.5 text-left transition-colors hover:bg-[rgba(248,249,250,0.62)] sm:grid-cols-[100px_170px_minmax(0,1fr)] sm:gap-4"
    >
      <span className="data-label text-[10px] uppercase tabular-nums text-[var(--px-muted)]">
        {item.dateLabel}
      </span>
      <span className="data-label text-[10px] uppercase" style={{ color: item.color }}>
        {item.typeLabel}
      </span>
      <span className="text-sm text-[var(--px-text)]">{item.title}</span>
    </button>
  );
}

export function CompanyAnnouncementStory({
  companyName,
  companySlug,
  story,
  availabilityMessage,
  available,
  allAnnouncementsUrl,
  initialDetail,
  discussionRoomId,
  discussionRoomName,
}: CompanyAnnouncementStoryProps) {
  const [query, setQuery] = useState("");
  const [buckets, setBuckets] = useState<StoryBucket[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ event: StoryEvent; announcement: StoryAnnouncement | null } | null>(
    null,
  );
  const [detailCache, setDetailCache] = useState<Record<string, NormalizedAnnouncementDetail>>(
    initialDetail ? { [initialDetail.id]: initialDetail } : {},
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  const eras = useMemo(() => filterEras(story.eras, query, buckets), [story.eras, query, buckets]);
  const visibleCount = useMemo(
    () => eras.reduce((sum, era) => sum + era.events.reduce((inner, event) => inner + event.announcementCount, 0), 0),
    [eras],
  );
  const isFiltered = query.trim().length > 0 || buckets.length > 0;

  const fetchDetail = useCallback(
    async (announcement: StoryAnnouncement) => {
      if (detailCache[announcement.id] || inFlight.current.has(announcement.id)) return;
      inFlight.current.add(announcement.id);
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await fetch(
          `/api/companies/${companySlug}/announcements/${announcement.id}?publishedAt=${encodeURIComponent(
            toIsoDateParam(announcement.publishedAt),
          )}`,
        );
        if (!response.ok) {
          throw new Error("Klarte ikke å hente registerteksten.");
        }
        const payload = (await response.json()) as { data: NormalizedAnnouncementDetail };
        setDetailCache((current) => ({ ...current, [announcement.id]: payload.data }));
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "Klarte ikke å hente registerteksten.");
      } finally {
        inFlight.current.delete(announcement.id);
        setDetailLoading(false);
      }
    },
    [companySlug, detailCache],
  );

  const open = useCallback(
    (event: StoryEvent, announcement: StoryAnnouncement | null) => {
      setSelected({ event, announcement });
      setDetailError(null);
      if (announcement) {
        void fetchDetail(announcement);
      }
    },
    [fetchDetail],
  );

  useEffect(() => {
    if (!selected) return;
    function handleKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected]);

  const selectedDetail = selected?.announcement ? (detailCache[selected.announcement.id] ?? null) : null;

  return (
    <div>
      {/* ── Intro: what the register holds, and the numbers behind it ── */}
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-12">
        <div>
          <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">Selskapets historie</div>
          <h2 className="editorial-display mt-2.5 text-[34px] font-semibold leading-[1.1] text-[var(--px-text)] [text-wrap:pretty]">
            {story.headline}
          </h2>
          <p className="mt-3.5 max-w-[66ch] text-base leading-[1.72] text-[var(--px-muted)] [text-wrap:pretty]">
            {story.lead}
          </p>
          <p className="mt-2 max-w-[66ch] text-sm leading-[1.7] text-[var(--px-muted)]">
            {availabilityMessage}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {story.chapterLabel ? (
              <span className="data-label text-[10px] uppercase text-[var(--px-accent)]">
                {story.chapterLabel}
              </span>
            ) : null}
            {!available ? (
              <span className="data-label rounded-full border border-[var(--px-warning-border)] bg-[var(--px-warning-soft)] px-2.5 py-1 text-[10px] uppercase text-[var(--px-warning)]">
                Delvis tilgjengelig
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-5 pt-1.5">
          {story.stats.map((stat) => (
            <StatBlock key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </div>

      {/* ── Empty: the register has nothing, and the page says exactly that ── */}
      {story.isEmpty ? (
        <div className="mt-6 flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-surface)] p-11">
          <span className="material-symbols-outlined text-[28px] text-[var(--px-muted)]">campaign</span>
          <div className="text-base font-semibold text-[var(--px-text)]">Ingen kunngjøringer å vise</div>
          <p className="m-0 max-w-[52ch] text-center text-sm leading-[1.65] text-[var(--px-muted)]">
            Kilden har ingen registrerte kunngjøringer på dette organisasjonsnummeret. Historikken kan finnes i
            andre faner, men den konstrueres ikke her.
          </p>
          {allAnnouncementsUrl ? (
            <a
              href={allAnnouncementsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--px-text)] transition-colors hover:border-[rgba(15,23,42,0.2)]"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Se enheten hos Brreg
            </a>
          ) : null}
        </div>
      ) : null}

      {/* ── Legend and filter in one control: the colours are the categories ── */}
      {!story.isEmpty ? (
        <div className="mt-8 flex flex-col gap-3 border-t border-[var(--px-border)] pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--px-muted)]">
              search
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Søk i kunngjøringene for ${companyName}`}
              className="w-full rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] py-2.5 pl-10 pr-4 text-sm text-[var(--px-text)] outline-none transition-colors focus:border-[var(--px-accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {STORY_BUCKETS.map((bucket) => {
              const active = buckets.includes(bucket.id);
              return (
                <button
                  key={bucket.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setBuckets((current) =>
                      current.includes(bucket.id)
                        ? current.filter((item) => item !== bucket.id)
                        : [...current, bucket.id],
                    )
                  }
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-text)]"
                      : "border-[var(--px-border)] bg-[var(--px-surface-strong)] text-[var(--px-muted)] hover:text-[var(--px-text)]",
                  )}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: bucket.color }}
                    aria-hidden="true"
                  />
                  {bucket.label}
                </button>
              );
            })}
            {isFiltered ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setBuckets([]);
                }}
                className="data-label px-2 text-[10px] uppercase text-[var(--px-accent)] hover:text-[var(--px-action-hover)]"
              >
                Nullstill
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isFiltered ? (
        <div className="data-label mt-3 text-[10px] uppercase text-[var(--px-muted)]">
          {visibleCount === 0
            ? "Ingen kunngjøringer matcher filteret"
            : `${countLabel(visibleCount)} av ${story.total} vises`}
        </div>
      ) : null}

      {/* ── The chapters ── */}
      <div className="pb-2">
        {eras.map((era) => (
          <section key={era.key} className="pt-7">
            <div className="flex flex-wrap items-baseline gap-3 border-b border-[var(--px-border)] pb-3">
              {story.eras.length > 1 ? (
                <span className="data-label text-[10px] uppercase text-[var(--px-accent)]">{era.chapter}</span>
              ) : null}
              <span className="editorial-display text-2xl font-semibold leading-[1.15] text-[var(--px-text)]">
                {era.name}
              </span>
              <span className="data-label text-[10px] uppercase tabular-nums text-[var(--px-muted)]">
                {era.years}
              </span>
              <span className="flex-1" />
              <span className="data-label text-[10px] uppercase text-[var(--px-muted)]">{era.countLabel}</span>
            </div>

            <p className="mt-3 max-w-[78ch] text-[15px] leading-[1.7] text-[var(--px-muted)] [text-wrap:pretty]">
              {era.lead}
            </p>

            <div className="mt-3.5 flex flex-col">
              {era.events.map((event) => {
                const isExpanded = Boolean(expanded[event.key]);
                return (
                  <div
                    key={event.key}
                    className="grid gap-3 border-t border-[var(--px-border-subtle)] px-2.5 py-4 transition-colors hover:bg-[rgba(248,249,250,0.62)] sm:grid-cols-[110px_190px_minmax(0,1fr)] sm:gap-5"
                  >
                    <div className="data-label pt-0.5 text-[10px] uppercase tabular-nums text-[var(--px-muted)]">
                      {event.dateLabel}
                    </div>
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-[5px] size-2 shrink-0 rounded-full"
                        style={{ background: event.color }}
                        aria-hidden="true"
                      />
                      <span
                        className="data-label text-[10px] uppercase leading-[1.4]"
                        style={{ color: event.color }}
                      >
                        {event.typeLabel}
                      </span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => open(event, event.primary)}
                        className="text-left text-base font-semibold tracking-[-0.01em] text-[var(--px-text)] hover:text-[var(--px-accent)]"
                      >
                        {event.title}
                      </button>
                      <p className="mt-1.5 max-w-[70ch] text-[14.5px] leading-[1.7] text-[var(--px-muted)] [text-wrap:pretty]">
                        {event.explain}
                      </p>

                      {event.children.length > 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((current) => ({ ...current, [event.key]: !current[event.key] }))
                            }
                            className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--px-accent)] transition-colors hover:text-[var(--px-action-hover)]"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {isExpanded ? "expand_less" : "expand_more"}
                            </span>
                            {isExpanded
                              ? "Skjul enkeltkunngjøringene"
                              : `Vis alle ${event.children.length} kunngjøringene`}
                          </button>

                          {isExpanded ? (
                            <div className="mt-2.5 flex flex-col border-l-2 border-[var(--px-border)] pl-[18px]">
                              {event.children.map((child) => (
                                <ChildRow key={child.id} item={child} onOpen={() => open(event, child)} />
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ── Detail: the register's own text, never a paraphrase of it ── */}
      {selected ? (
        <div
          role="presentation"
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(17,24,39,0.45)] p-6 sm:p-14"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.announcement?.title ?? selected.event.title}
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            className="max-h-full w-full max-w-[640px] overflow-auto rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] shadow-[var(--shadow-md)]"
          >
            <div className="border-b border-[var(--px-border-subtle)] px-7 py-6">
              <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">
                Kunngjøring · {selectedDetail?.sourceLabel ?? "Brønnøysundregistrene"}
              </div>
              <div className="editorial-display mt-2 text-2xl font-semibold leading-[1.2] text-[var(--px-text)]">
                {selected.announcement?.title ?? selected.event.title}
              </div>
              <div className="mt-2 text-[13px] tabular-nums text-[var(--px-muted)]">
                {selected.announcement?.dateLabel ?? selected.event.dateLabel} ·{" "}
                {selected.announcement?.typeLabel ?? selected.event.typeLabel}
              </div>
            </div>

            <div className="px-7 py-6">
              <p className="m-0 text-[15px] leading-[1.7] text-[var(--px-text)] [text-wrap:pretty]">
                {selected.event.explain}
              </p>

              <div className="mt-5 rounded-lg border border-[var(--px-border-subtle)] bg-[var(--px-subtle)] px-[18px] py-4">
                <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">Registertekst</div>
                {selectedDetail ? (
                  <div
                    className={cn(
                      "mt-2 text-sm leading-[1.7] text-[var(--px-muted)]",
                      "[&_h3]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--px-text)]",
                      "[&_p]:mb-2 [&_strong]:font-semibold [&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse",
                      "[&_td]:border-b [&_td]:border-[var(--px-border-subtle)] [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top",
                      "[&_td:first-child]:w-[38%] [&_td:first-child]:font-medium [&_td:first-child]:text-[var(--px-muted)]",
                      "[&_tr:last-child_td]:border-b-0",
                    )}
                    dangerouslySetInnerHTML={{ __html: selectedDetail.contentHtml }}
                  />
                ) : (
                  <p className="m-0 mt-2 text-sm leading-[1.7] text-[var(--px-muted)]">
                    {detailLoading
                      ? "Henter registerteksten fra Brreg …"
                      : (detailError ?? selected.event.registerText)}
                  </p>
                )}
              </div>

              {discussionRoomId && discussionRoomName && selected.announcement ? (
                <div className="mt-5">
                  <AnnouncementDiscussionPanel
                    roomId={discussionRoomId}
                    roomName={discussionRoomName}
                    announcement={selected.announcement}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex gap-2.5 px-7 pb-6">
              <a
                href={selected.announcement?.detailUrl ?? allAnnouncementsUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--px-text)] transition-colors hover:border-[rgba(15,23,42,0.2)]"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                Åpne originalen
              </a>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--px-muted)] transition-colors hover:text-[var(--px-text)]"
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
