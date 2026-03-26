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
          <label className="mb-2 block text-sm font-medium text-slate-700">Navn</label>
          <input name="name" required className="w-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 outline-none focus:border-[#31495f]" />
        </div>
      ) : null}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">E-post</label>
        <input name="email" type="email" required className="w-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 outline-none focus:border-[#31495f]" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Passord</label>
        <input name="password" type="password" required className="w-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 outline-none focus:border-[#31495f]" />
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white disabled:opacity-70">
        {pending ? "Logger inn..." : mode === "login" ? "Logg inn" : "Opprett konto"}
      </button>
    </form>
  );
}
