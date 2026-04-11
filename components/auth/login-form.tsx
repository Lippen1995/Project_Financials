"use client";

import { useActionState } from "react";

import { loginAction, registerAction } from "@/server/actions/auth-actions";

type FormState = { error: string };

function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  showNameField = false,
}: {
  action: (state: FormState | void, formData: FormData) => Promise<FormState | void>;
  submitLabel: string;
  pendingLabel: string;
  showNameField?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const errorMessage = state?.error ?? "";

  return (
    <form action={formAction} className="space-y-4">
      {showNameField ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Navn</label>
          <input
            name="name"
            required
            className="w-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 outline-none focus:border-[#31495f]"
          />
        </div>
      ) : null}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">E-post</label>
        <input
          name="email"
          type="email"
          required
          className="w-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 outline-none focus:border-[#31495f]"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Passord</label>
        <input
          name="password"
          type="password"
          required
          className="w-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 outline-none focus:border-[#31495f]"
        />
      </div>
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[#162233] px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

export function LoginForm() {
  return (
    <AuthForm
      action={loginAction}
      submitLabel="Logg inn"
      pendingLabel="Logger inn..."
    />
  );
}

export function RegisterForm() {
  return (
    <AuthForm
      action={registerAction}
      submitLabel="Opprett konto"
      pendingLabel="Oppretter konto..."
      showNameField
    />
  );
}
