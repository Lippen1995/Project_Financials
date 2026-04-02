"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/lib/auth";
import { ensureUserWorkspaceState } from "@/server/services/workspace-service";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
});

function isDatabaseUnavailableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Can't reach database server") ||
    error.message.includes("PrismaClientInitializationError") ||
    error.message.includes("localhost:5432")
  );
}

function getAuthActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return "Ugyldige felter.";
  }

  if (error instanceof AuthError) {
    return "Innlogging feilet. Kontroller e-post og passord.";
  }

  if (isDatabaseUnavailableError(error)) {
    return "Databasen er utilgjengelig akkurat nå. Start databaseforbindelsen og prøv igjen.";
  }

  return fallback;
}

export async function loginAction(_: unknown, formData: FormData) {
  try {
    const values = authSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const existing = await prisma.user.findUnique({
      where: {
        email: values.email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      await ensureUserWorkspaceState(existing.id);
    }

    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
  } catch (error) {
    return { error: getAuthActionErrorMessage(error, "Innlogging feilet.") };
  }

  redirect("/dashboard");
}

export async function registerAction(_: unknown, formData: FormData) {
  try {
    const values = authSchema.extend({ name: z.string().min(2) }).parse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const existing = await prisma.user.findUnique({ where: { email: values.email } });
    if (existing) {
      return { error: "Brukeren finnes allerede." };
    }

    const passwordHash = await bcrypt.hash(values.password, 10);

    const user = await prisma.user.create({
      data: {
        name: values.name,
        email: values.email,
        passwordHash,
        subscription: {
          create: {
            plan: "free",
          },
        },
      },
    });

    await ensureUserWorkspaceState(user.id);

    await signIn("credentials", {
      email: user.email,
      password: values.password,
      redirect: false,
    });
  } catch (error) {
    return { error: getAuthActionErrorMessage(error, "Registrering feilet.") };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
