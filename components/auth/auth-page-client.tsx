"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn as clientSignIn } from "next-auth/react";
import { useState, useTransition } from "react";

import { AUTH_POST_LOGIN_PATH } from "@/lib/linkedin-auth";
import { signInWithLinkedInAction } from "@/server/actions/auth-actions";

type AuthMode = "login" | "register";

type FormValues = {
  name: string;
  email: string;
  password: string;
};

function LinkedInButton({
  linkedinConfigured,
  linkedInHelpText,
}: {
  linkedinConfigured: boolean;
  linkedInHelpText?: string | null;
}) {
  return (
    <form action={signInWithLinkedInAction}>
      <button
        type="submit"
        disabled={!linkedinConfigured}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-outline-variant bg-white text-on-surface font-body-md hover:bg-surface-container-low transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
      >
        <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
        </svg>
        Fortsett med LinkedIn
      </button>

      {!linkedinConfigured && linkedInHelpText ? (
        <p className="mt-3 text-sm text-[var(--px-muted)]">{linkedInHelpText}</p>
      ) : null}
    </form>
  );
}

function EmailAuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function updateField(field: keyof FormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCredentialsSignIn() {
    const result = await clientSignIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
      redirectTo: AUTH_POST_LOGIN_PATH,
    });

    if (result?.error) {
      setError("Innlogging feilet. Kontroller e-post og passord.");
      return;
    }

    router.push((result?.url ?? AUTH_POST_LOGIN_PATH) as never);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      if (mode === "register") {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        });

        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(data.error ?? "Registrering feilet.");
          return;
        }
      }

      await handleCredentialsSignIn();
    });
  }

  const isLogin = mode === "login";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isLogin ? (
        <div>
          <label
            htmlFor="name"
            className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block"
          >
            Fullt navn
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={values.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Ditt navn"
            className="w-full bg-transparent border-b border-outline-variant focus:border-primary px-0 py-2 outline-none transition-colors duration-300 font-body-md text-on-surface placeholder:text-outline"
          />
        </div>
      ) : null}

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
          value={values.email}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="navn@firma.no"
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
          value={values.password}
          onChange={(event) => updateField("password", event.target.value)}
          placeholder="••••••••"
          className="w-full bg-transparent border-b border-outline-variant focus:border-primary px-0 py-2 outline-none transition-colors duration-300 font-body-md text-on-surface placeholder:text-outline"
        />
      </div>

      {isLogin ? (
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
          <span className="font-body-md text-secondary text-[14px]">Glemt passord?</span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-error">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-primary-container text-white py-4 font-label-caps text-label-caps uppercase tracking-widest hover:opacity-90 transition-opacity duration-300 disabled:opacity-50"
      >
        {pending
          ? isLogin
            ? "Logger inn..."
            : "Oppretter konto..."
          : isLogin
            ? "Logg inn"
            : "Opprett konto"}
      </button>
    </form>
  );
}

export function AuthPageClient({
  mode,
  linkedinConfigured,
  linkedInHelpText,
}: {
  mode: AuthMode;
  linkedinConfigured: boolean;
  linkedInHelpText?: string | null;
}) {
  const isLogin = mode === "login";

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden">
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

      <main className="w-full md:w-1/2 bg-surface flex flex-col justify-between p-margin-md md:p-margin-lg">
        <header className="flex justify-between items-center">
          <Link
            href="/"
            className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary"
          >
            Fjord Insight
          </Link>
          <div className="md:hidden">
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-label-caps text-label-caps text-secondary uppercase hover:underline"
            >
              {isLogin ? "Opprett konto" : "Logg inn"}
            </Link>
          </div>
        </header>

        <div className="max-w-md w-full mx-auto flex-grow flex flex-col justify-center py-section-padding">
          <div className="mb-margin-md">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
              {isLogin ? "Velkommen tilbake" : "Opprett din konto"}
            </h2>
            <p className="font-body-md text-on-surface-variant">
              {isLogin
                ? "Vennligst logg inn på din konto."
                : "Start med LinkedIn eller registrer deg med e-post."}
            </p>
          </div>

          <LinkedInButton
            linkedinConfigured={linkedinConfigured}
            linkedInHelpText={linkedInHelpText}
          />

          <div className="relative my-8 flex items-center">
            <div className="flex-grow h-px bg-outline-variant/20" />
            <span className="px-4 font-label-caps text-label-caps text-outline-variant uppercase">
              {isLogin ? "eller logg inn med e-post" : "eller opprett konto med e-post"}
            </span>
            <div className="flex-grow h-px bg-outline-variant/20" />
          </div>

          <EmailAuthForm mode={mode} />

          <div className="mt-8 text-center">
            <span className="font-body-md text-on-surface-variant text-[14px]">
              {isLogin ? "Har du ikke konto? " : "Har du allerede konto? "}
            </span>
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-body-md text-secondary font-semibold text-[14px] hover:underline"
            >
              {isLogin ? "Opprett en konto her" : "Gå til innlogging"}
            </Link>
          </div>
        </div>

        <footer className="flex justify-between items-center pt-margin-md border-t border-outline-variant/20">
          <span className="font-label-caps text-label-caps text-on-tertiary-container uppercase">
            © 2024 Fjord Insight AS
          </span>
          <div className="flex gap-margin-sm">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Vilkår
            </span>
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Personvern
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
