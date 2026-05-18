"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/server/actions/auth-actions";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden">
      {/* Left: Brand panel */}
      <aside
        className="hidden md:flex relative w-1/2 overflow-hidden flex-col justify-center px-margin-lg"
        style={{ background: "linear-gradient(135deg, #0b1c30 0%, #131b2e 100%)" }}
      >
        <div className="absolute inset-0">
          <video
            className="w-full h-full object-cover opacity-20 mix-blend-overlay"
            src="/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
        <div className="relative z-10 max-w-xl">
          <h1 className="font-display-lg text-display-lg text-white mb-6 leading-tight">
            Få skarpere selskapsinnsikt.
          </h1>
          <p className="font-body-lg text-body-lg text-on-primary-container max-w-lg mb-margin-md">
            Logg inn for å få tilgang til sanntidsdata, nettverksanalyse og dype finansielle
            rapporter for over 1,2 millioner norske bedrifter.
          </p>
          <div className="flex items-center gap-4 mt-12 opacity-60">
            <div className="flex -space-x-2">
              {["account_balance", "monitoring", "hub"].map((icon) => (
                <div
                  key={icon}
                  className="w-8 h-8 rounded-full border-2 border-primary-container bg-surface-dim flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[16px] text-white">{icon}</span>
                </div>
              ))}
            </div>
            <span className="font-label-caps text-label-caps text-on-primary-container uppercase tracking-widest">
              Markedsledende analyseplattform
            </span>
          </div>
        </div>
      </aside>

      {/* Right: Auth form */}
      <main className="w-full md:w-1/2 bg-surface flex flex-col justify-between p-margin-md md:p-margin-lg">
        <header className="flex justify-between items-center">
          <Link
            href="/"
            className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary"
          >
            Fjord Insight
          </Link>
          <div className="md:hidden">
            <a
              href="#"
              className="font-label-caps text-label-caps text-secondary uppercase hover:underline"
            >
              Opprett konto
            </a>
          </div>
        </header>

        <div className="max-w-md w-full mx-auto flex-grow flex flex-col justify-center py-section-padding">
          <div className="mb-margin-md">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
              Velkommen tilbake
            </h2>
            <p className="font-body-md text-on-surface-variant">
              Vennligst logg inn på din konto.
            </p>
          </div>

          {/* LinkedIn button */}
          <button className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-outline-variant bg-white text-on-surface font-body-md hover:bg-surface-container-low transition-colors duration-200">
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
            </svg>
            Fortsett med LinkedIn
          </button>

          {/* Divider */}
          <div className="relative my-8 flex items-center">
            <div className="flex-grow h-px bg-outline-variant/20" />
            <span className="px-4 font-label-caps text-label-caps text-outline-variant uppercase">
              eller logg inn med e-post
            </span>
            <div className="flex-grow h-px bg-outline-variant/20" />
          </div>

          <LoginForm />

          <div className="mt-8 text-center">
            <span className="font-body-md text-on-surface-variant text-[14px]">
              Har du ikke konto?{" "}
            </span>
            <a
              href="#"
              className="font-body-md text-secondary font-semibold text-[14px] hover:underline"
            >
              Opprett en konto her
            </a>
          </div>
        </div>

        <footer className="flex justify-between items-center pt-margin-md border-t border-outline-variant/20">
          <span className="font-label-caps text-label-caps text-on-tertiary-container uppercase">
            © 2024 Fjord Insight AS
          </span>
          <div className="flex gap-margin-sm">
            <a
              href="#"
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary uppercase"
            >
              VilkÅr
            </a>
            <a
              href="#"
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary uppercase"
            >
              Personvern
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, { error: "" });

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label
          htmlFor="email"
          className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block"
        >
          E-postadresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="••••••••"
          className="w-full bg-transparent border-b border-outline-variant focus:border-primary px-0 py-2 outline-none transition-colors duration-300 font-body-md text-on-surface placeholder:text-outline"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block"
        >
          Passord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          placeholder="••••••••"
          className="w-full bg-transparent border-b border-outline-variant focus:border-primary px-0 py-2 outline-none transition-colors duration-300 font-body-md text-on-surface placeholder:text-outline"
        />
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            className="w-4 h-4 border-outline-variant text-primary focus:ring-primary rounded-sm"
          />
          <label htmlFor="remember" className="font-body-md text-on-surface-variant text-[14px]">
            Husk meg
          </label>
        </div>
        <a href="#" className="font-body-md text-secondary text-[14px] hover:underline">
          Glemt passord?
        </a>
      </div>
      {state?.error ? (
        <p className="text-sm text-error">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-primary-container text-white py-4 font-label-caps text-label-caps uppercase tracking-widest hover:opacity-90 transition-opacity duration-300 disabled:opacity-50"
      >
        {pending ? "Logger inn..." : "Logg inn"}
      </button>
    </form>
  );
}

