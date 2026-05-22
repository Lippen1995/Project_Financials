import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { userProfilePatchSchema } from "@/lib/user-profile";
import { getPrivateUserProfileView, saveUserProfile } from "@/server/services/user-profile-service";

export async function GET() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getPrivateUserProfileView(session.user.id);
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  const session = await safeAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = userProfilePatchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid profile payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const saved = await saveUserProfile(session.user.id, parsed.data);
  return NextResponse.json(saved);
}
