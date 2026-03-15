"use client";

import { useActionState } from "react";

import { loginAction, registerAction } from "@/server/actions/auth-actions";

type Mode = "login" | "register";

export function LoginForm({ mode }: { mode: Mode }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState(action, { error: "" });

  return (
    <form action={formAction} className="space-y-4">
      {mode === "register" ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-ink/70">Navn</label>
          <input name="name" required className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-tide" />
        </div>
      ) : null}
      <div>
        <label className="mb-2 block text-sm font-medium text-ink/70">E-post</label>
        <input name="email" type="email" required className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-tide" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink/70">Passord</label>
        <input name="password" type="password" required className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-tide" />
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-tide px-5 py-3 text-sm font-semibold text-white disabled:opacity-70">
        {pending ? "Arbeider..." : mode === "login" ? "Logg inn" : "Opprett konto"}
      </button>
    </form>
  );
}