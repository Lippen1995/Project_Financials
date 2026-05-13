import Link from "next/link";
import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";

export default async function HomePage() {
  const session = await safeAuth();
  if (session?.user) {
    redirect("/dashboard");
  }
  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="bg-background text-on-background">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30">
        <div className="flex justify-between items-center max-w-container-max mx-auto px-margin-lg h-20">
          <div className="flex items-center gap-8">
            <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">
              Fjord Insight
            </span>
            <div className="hidden md:flex gap-6">
              <a className="text-primary border-b-2 border-primary pb-1 font-body-md text-body-md" href="#">
                Solutions
              </a>
              <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md" href="#">
                Data Hub
              </a>
              <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md" href="#">
                Network
              </a>
              <a className="text-on-surface-variant hover:text-primary transition-colors font-body-md text-body-md" href="#">
                Pricing
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="font-body-md text-body-md text-on-surface-variant hover:opacity-80 transition-opacity"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-body-md text-body-md hover:opacity-90 transition-opacity"
            >
              Get Pro
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative h-screen w-full flex items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 z-0">
          <video
            className="w-full h-full object-cover"
        <div className="absolute inset-0 bg-primary-container z-0">
          <video
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
            src="/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 text-center px-margin-lg max-w-4xl">
          <h1 className="font-display-lg text-display-lg text-on-primary mb-6">
            Norsk forretningsinnsikt, redefinert.
          </h1>
          <p className="font-body-lg text-body-lg text-on-primary/80 mb-10 max-w-2xl mx-auto">
            Kombinerer AI-drevet analyse med 100% pålitelige data fra Brønnøysundregistrene for å gi
            deg et konkurransefortrinn i det nordiske markedet.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="bg-on-primary text-primary-container px-8 py-4 rounded-lg font-body-md text-body-md font-bold hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              Start din analyse
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Search & Features */}
      <section className="py-section-padding bg-surface">
        <div className="max-w-container-max mx-auto px-margin-lg">
          <div className="text-center mb-16">
            <h2 className="font-headline-md text-headline-md mb-8">
              Søk i 1,2 millioner norske bedrifter
            </h2>
            <div className="max-w-2xl mx-auto relative">
              <form action="/search" method="GET">
                <div className="flex items-center border border-outline-variant bg-white rounded-lg px-6 py-4 focus-within:border-primary transition-colors shadow-sm">
                  <span className="material-symbols-outlined text-outline mr-3">search</span>
                  <input
                    name="q"
                    className="w-full border-none focus:ring-0 p-0 font-body-md text-body-md text-on-surface bg-transparent outline-none"
                    placeholder="Firmanavn, org.nr eller person..."
                    type="text"
                  />
                  <button
                    type="submit"
                    className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-caps text-label-caps ml-4"
                  >
                    SØK NÅ
                  </button>
                </div>
              </form>
              <div className="mt-4 flex flex-wrap justify-center gap-4">
                <span className="font-label-caps text-label-caps text-on-surface-variant opacity-60">
                  POPULÆRE SØK:
                </span>
                <Link href="/search?q=Equinor+ASA" className="font-label-caps text-label-caps text-primary hover:underline">
                  Equinor ASA
                </Link>
                <Link href="/search?q=DNB+Bank" className="font-label-caps text-label-caps text-primary hover:underline">
                  DNB Bank
                </Link>
                <Link href="/search?q=Aker+BP" className="font-label-caps text-label-caps text-primary hover:underline">
                  Aker BP
                </Link>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter pt-8">
            <div className="group border-t border-outline-variant/30 py-8 hover:bg-white transition-colors px-4 -mx-4 rounded-lg">
              <div className="w-12 h-12 bg-surface-container-low rounded-lg flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <span className="material-symbols-outlined">sync</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm mb-4">Sanntidsoppdaterte data</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Få direkte tilgang til ferske regnskapstall, styreendringer og kredittvurderinger
                øyeblikket de blir registrert i offentlige registre.
              </p>
            </div>
            <div className="group border-t border-outline-variant/30 py-8 hover:bg-white transition-colors px-4 -mx-4 rounded-lg">
              <div className="w-12 h-12 bg-surface-container-low rounded-lg flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <span className="material-symbols-outlined">hub</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm mb-4">Nettverksvisualisering</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Se komplekse eierstrukturer og forbindelser mellom selskaper og nøkkelpersoner med
                våre interaktive relasjonskart.
              </p>
            </div>
            <div className="group border-t border-outline-variant/30 py-8 hover:bg-white transition-colors px-4 -mx-4 rounded-lg">
              <div className="w-12 h-12 bg-surface-container-low rounded-lg flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <span className="material-symbols-outlined">insights</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm mb-4">AI Business Insight</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Vår AI-motor analyserer trender og markedsbevegelser for å gi deg de mest relevante
                beslutningsgrunnlagene og prognosene.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Market Trends */}
      <section className="py-section-padding border-t border-outline-variant/30">
        <div className="max-w-container-max mx-auto px-margin-lg">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="font-headline-md text-headline-md mb-2">Markedstrender</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Selskaper med høy aktivitet og vekst akkurat nå.
              </p>
            </div>
            <Link
              href="/search"
              className="font-label-caps text-label-caps text-primary flex items-center gap-2 hover:opacity-70"
            >
              SE ALLE TRENDER
              <span className="material-symbols-outlined text-[16px]">arrow_outward</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <TrendCard
              initials="KA"
              bgClass="bg-primary-fixed"
              textClass="text-on-primary-fixed"
              change="+12.4%"
              positive
              name="KONGSBERG GRUPPEN ASA"
              sector="Forsvar og teknologi"
              value="40.6 MRD"
            />
            <TrendCard
              initials="SH"
              bgClass="bg-surface-container-high"
              textClass="text-on-surface"
              change="+8.3%"
              positive
              name="STOREBRAND ASA"
              sector="Finans og forsikring"
              value="12.2 MRD"
            />
            <TrendCard
              initials="YA"
              bgClass="bg-secondary-fixed-dim"
              textClass="text-on-secondary-container"
              change="-2.3%"
              positive={false}
              name="YARA INTERNATIONAL ASA"
              sector="Kjemisk industri"
              value="155.1 MRD"
            />
            <TrendCard
              initials="EL"
              bgClass="bg-surface-variant"
              textClass="text-on-surface"
              change="+15.7%"
              positive
              name="ELKEM ASA"
              sector="Materialteknologi"
              value="35.8 MRD"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-section-padding bg-primary-container relative overflow-hidden">
        <div className="max-w-container-max mx-auto px-margin-lg relative z-10 flex flex-col md:flex-row items-center gap-gutter">
          <div className="flex-1">
            <h2 className="font-display-lg text-display-lg text-on-primary mb-6">
              Oppgrader til Proff Insight Pro
            </h2>
            <p className="font-body-lg text-body-lg text-on-primary/70 mb-8 max-w-xl">
              Få full tilgang til avanserte verktøy for dypere analyse og markedsforståelse. Perfekt
              for finansanalytikere og beslutningstakere.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "Eksport av store datasett til Excel/CSV",
                "Ubegrenset tilgang til nettverkskart",
                "Avansert kredittmonitorering og varsler",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-on-primary">
                  <span className="material-symbols-outlined text-secondary-container">check_circle</span>
                  <span className="font-body-md text-body-md">{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/login"
                className="bg-secondary-container text-on-secondary-container px-8 py-4 rounded-lg font-body-md text-body-md font-bold hover:brightness-110 transition-all"
              >
                Start din gratis prøveperiode
              </Link>
              <button className="border border-on-primary/30 text-on-primary px-8 py-4 rounded-lg font-body-md text-body-md hover:bg-white/10 transition-all">
                Se alle funksjoner
              </button>
            </div>
          </div>
          <div className="flex-1 w-full max-w-lg aspect-video rounded-xl overflow-hidden border border-on-primary/10 shadow-2xl relative">
            <img
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCaSd1MeFOQYSB9NVyzIQglh0w-Z28DPbTnwDWstCoEmF-6K42j7O7K1Rcnj1IujDisGw-S4tC2XfMZmh4EkdF7rDaogCmxyADIQlDuPRJWBK4Jqv3B0s3ZyUOmwixcavzRdBYmhE8vTHGACgAWI45cJoTKrnbVXvQKp7ieZfIOdNcG82lHUQW9YHNI0Md_iPVLmC5uDAZ116I0k1gCqhLqsp8jt-xQXjlP5-Qn2DQHTa2yEDL1qZgaFWxAQAQUF-ly9TPpmiHgpXo"
              alt="Analytics dashboard"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary-container/60 to-transparent" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-container-lowest w-full py-section-padding border-t border-outline-variant">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter max-w-container-max mx-auto px-margin-lg">
          <div>
            <span className="font-headline-sm text-headline-sm text-primary mb-6 block">
              Fjord Insight
            </span>
            <p className="font-label-caps text-label-caps text-on-surface-variant mb-4">
              © 2024 Fjord Insight AS. All rights reserved.
            </p>
          </div>
          <div>
            <h5 className="font-label-caps text-label-caps text-primary mb-4">RETTIGHETER</h5>
            <ul className="space-y-3">
              <li>
                <a href="#" className="font-label-caps text-label-caps text-on-surface-variant hover:text-secondary transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="font-label-caps text-label-caps text-on-surface-variant hover:text-secondary transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-label-caps text-label-caps text-primary mb-4">RESSURSER</h5>
            <ul className="space-y-3">
              <li>
                <a href="#" className="font-label-caps text-label-caps text-on-surface-variant hover:text-secondary transition-colors">
                  API Documentation
                </a>
              </li>
              <li>
                <a href="#" className="font-label-caps text-label-caps text-on-surface-variant hover:text-secondary transition-colors">
                  Contact Support
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-label-caps text-label-caps text-primary mb-4">FØLG OSS</h5>
            <div className="flex gap-4">
              <a
                href="#"
                className="w-10 h-10 border border-outline-variant rounded flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">share</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TrendCard({
  initials,
  bgClass,
  textClass,
  change,
  positive,
  name,
  sector,
  value,
}: {
  initials: string;
  bgClass: string;
  textClass: string;
  change: string;
  positive: boolean;
  name: string;
  sector: string;
  value: string;
}) {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-lg border border-outline-variant/20 hover:shadow-lg transition-all">
      <div className="flex justify-between items-start mb-6">
        <div
          className={`w-10 h-10 ${bgClass} rounded flex items-center justify-center font-bold ${textClass}`}
        >
          {initials}
        </div>
        <span
          className={`${positive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"} text-[10px] font-bold px-2 py-1 rounded-sm`}
        >
          {change}
        </span>
      </div>
      <h4 className="font-label-caps text-label-caps mb-1">{name}</h4>
      <p className="text-[12px] text-on-surface-variant mb-4">{sector}</p>
      <div className="flex items-center gap-2 text-primary">
        <span className="material-symbols-outlined text-[18px]">
          {positive ? "trending_up" : "trending_down"}
        </span>
        <span className="font-data-mono text-data-mono">{value}</span>
      </div>
    </div>
  );
}
