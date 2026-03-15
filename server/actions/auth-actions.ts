"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/lib/auth";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
});

export async function loginAction(_: unknown, formData: FormData) {
  try {
    const values = authSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Innlogging feilet. Kontroller e-post og passord." };
    }

    return { error: "Ugyldige felter." };
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

    await signIn("credentials", {
      email: user.email,
      password: values.password,
      redirect: false,
    });
  } catch {
    return { error: "Registrering feilet." };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}