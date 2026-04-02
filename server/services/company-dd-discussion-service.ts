import { CompanyDdDiscussionContext } from "@/lib/types";
import { prisma } from "@/lib/prisma";

export async function getCompanyDdDiscussionContext(
  userId: string,
  companyOrgNumber: string,
  preferredRoomId?: string | null,
): Promise<CompanyDdDiscussionContext | null> {
  if (!preferredRoomId) {
    return null;
  }

  const rooms = await prisma.ddRoom.findMany({
    where: {
      status: "ACTIVE",
      primaryCompany: {
        orgNumber: companyOrgNumber,
      },
      workspace: {
        status: "ACTIVE",
        members: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
  });

  if (rooms.length === 0) {
    return null;
  }

  const selectedRoom = rooms.find((room) => room.id === preferredRoomId);
  if (!selectedRoom) {
    return null;
  }

  return {
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      workspaceId: room.workspaceId,
      workspaceName: room.workspace.name,
      workspaceType: room.workspace.type,
      lastActivityAt: room.lastActivityAt,
    })),
    selectedRoomId: selectedRoom.id,
    selectedRoomName: selectedRoom.name,
  };
}
