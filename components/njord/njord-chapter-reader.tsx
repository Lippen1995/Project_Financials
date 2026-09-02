"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { NJORD_CHAPTERS, njordChapterAnchor } from "@/lib/njord-intro";
import { cn } from "@/lib/utils";

const HEADER_OFFSET = 120;

/**
 * De sju kapitlene om den norrøne Njord. Overskriftene kan skummes; hvert kapittel åpnes for
 * seg. Skinnen til venstre følger lesingen, slik at leseren ser hvor i fortellingen han er
 * uten å måtte åpne noe.
 */
export function NjordChapterReader() {
  const [openChapters, setOpenChapters] = useState<Record<number, boolean>>({});
  const [activeChapter, setActiveChapter] = useState(NJORD_CHAPTERS[0].n);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [markerTop, setMarkerTop] = useState(0);

  const toggleChapter = useCallback((chapter: number) => {
    setOpenChapters((current) => ({ ...current, [chapter]: !current[chapter] }));
  }, []);

  const openAndJump = useCallback((chapter: number) => {
    setOpenChapters((current) => ({ ...current, [chapter]: true }));
    setActiveChapter(chapter);
    const element = document.getElementById(njordChapterAnchor(chapter));
    if (element) {
      window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - HEADER_OFFSET,
      });
    }
  }, []);

  // Kapittelet som ligger nærmest midten av skjermen er det leseren faktisk ser på.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    // Marginen klemmer observatøren ned til én linje midt på skjermen, slik at nøyaktig ett
    // kapittel er «i lesing» om gangen. Utenfor kapittelstrekket krysser ingen linjen, og da
    // står markeringen igjen på det siste kapittelet leseren faktisk var i.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const chapter = Number(entry.target.getAttribute("data-chapter"));
          if (chapter) setActiveChapter(chapter);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );

    for (const chapter of NJORD_CHAPTERS) {
      const element = document.getElementById(njordChapterAnchor(chapter.n));
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  // Markøren posisjoneres fra den faktiske knappen, slik at den ikke glir ut av kurs når
  // kapitteltitlene brytes over to linjer.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const button = rail.querySelector<HTMLElement>(`[data-rail-chapter="${activeChapter}"]`);
    if (button) {
      setMarkerTop(button.offsetTop);
    }
  }, [activeChapter]);

  return (
    <div className="grid items-start gap-14 lg:grid-cols-[minmax(210px,270px)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-28">
        <div className="data-label text-[10px] uppercase text-white/50">Historien</div>
        <h2 className="editorial-display mt-4 text-[34px] leading-[1.14] text-white">
          Historien om den norrøne Njord
        </h2>
        <p className="mt-4 text-[15px] leading-[1.62] text-white/60">
          Sju kapitler om en gud som beveger seg mellom verdener — og som hører hjemme ved sjøen.
          Skum overskriftene, eller åpne kapitlene og les.
        </p>

        <div className="data-label mt-9 text-[9px] uppercase text-white/40">
          Kapittel {String(activeChapter).padStart(2, "0")} / {String(NJORD_CHAPTERS.length).padStart(2, "0")}
        </div>

        <div ref={railRef} className="relative mt-4 pl-4">
          <div aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-px bg-white/15" />
          <div
            aria-hidden="true"
            className="absolute -left-px h-[22px] w-[3px] bg-[var(--px-accent)] transition-[top] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
            style={{ top: `${markerTop}px` }}
          />
          <nav aria-label="Kapitler" className="grid gap-2">
            {NJORD_CHAPTERS.map((chapter) => (
              <button
                key={chapter.n}
                type="button"
                data-rail-chapter={chapter.n}
                onClick={() => openAndJump(chapter.n)}
                className={cn(
                  "text-left text-[13.5px] leading-[22px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  activeChapter === chapter.n ? "text-white/95" : "text-white/50 hover:text-white/80",
                )}
              >
                {chapter.title}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div>
        {NJORD_CHAPTERS.map((chapter) => {
          const isOpen = Boolean(openChapters[chapter.n]);
          const bodyId = `${njordChapterAnchor(chapter.n)}-body`;
          return (
            <article
              key={chapter.n}
              id={njordChapterAnchor(chapter.n)}
              data-chapter={chapter.n}
              className={cn("border-t border-white/15 pt-10", isOpen ? "pb-11" : "pb-10")}
            >
              <button
                type="button"
                onClick={() => toggleChapter(chapter.n)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                className="flex w-full items-start gap-7 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <span
                  className={cn(
                    "data-label pt-2.5 text-[9px] uppercase transition-colors",
                    isOpen || activeChapter === chapter.n ? "text-[var(--px-accent)]" : "text-white/35",
                  )}
                >
                  {chapter.num}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="editorial-display block text-[32px] leading-[1.15] text-white">
                    {chapter.title}
                  </span>
                  <span className="mt-3 block max-w-[62ch] text-[17px] leading-[1.62] text-white/65">
                    {chapter.lead}
                  </span>
                  <span
                    className={cn(
                      "data-label mt-4 inline-flex items-center text-[10px] uppercase",
                      isOpen ? "text-white/55" : "text-white/80",
                    )}
                  >
                    {isOpen ? "Vis mindre" : "Les mer"}
                    <span aria-hidden="true" className="material-symbols-outlined ml-1.5 text-[16px]">
                      {isOpen ? "expand_less" : "expand_more"}
                    </span>
                  </span>
                </span>
              </button>

              {/* 0fr → 1fr lar kapittelet folde seg ut i sin egen høyde; `invisible` holder den
                  lukkede teksten utenfor både tabbrekkefølgen og skjermleseren. */}
              <div
                id={bodyId}
                className={cn(
                  "ml-10 grid overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
                  isOpen
                    ? "visible grid-rows-[1fr] pt-7 opacity-100"
                    : "invisible grid-rows-[0fr] pt-0 opacity-0",
                )}
              >
                <div className="min-h-0 max-w-[1020px]">
                  {chapter.paras.map((paragraph) => (
                    <p key={paragraph.slice(0, 48)} className="mb-4 text-[16.5px] leading-[1.72] text-white/75">
                      {paragraph}
                    </p>
                  ))}

                  <dl className="mt-5 inline-grid gap-2.5 border-l border-white/15 py-1 pl-5">
                    {chapter.facts.map((fact) => (
                      <div key={fact.label} className="flex items-baseline gap-3.5">
                        <dt className="data-label min-w-[108px] text-[8.5px] uppercase text-white/40">
                          {fact.label}
                        </dt>
                        <dd className="text-sm text-white/80">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div>
                    <button
                      type="button"
                      onClick={() => toggleChapter(chapter.n)}
                      className="data-label mt-6 inline-flex items-center gap-1.5 text-[9px] uppercase text-white/55 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      Vis mindre
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        expand_less
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
