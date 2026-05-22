import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ensureUserBaselineState } from "@/server/services/user-profile-service";

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(6),
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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const values = registerSchema.parse(payload);

    const existing = await prisma.user.findUnique({
      where: { email: values.email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Brukeren finnes allerede." }, { status: 409 });
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
            status: "FREE",
          },
        },
      },
    });

    await ensureUserBaselineState(user.id, {
      displayName: user.name,
      email: user.email,
      profileImageUrl: user.image,
      requireOnboarding: true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ugyldige felter." }, { status: 400 });
    }

    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          error: "Databasen er utilgjengelig akkurat nå. Start databaseforbindelsen og prøv igjen.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: "Registrering feilet." }, { status: 500 });
  }
}
