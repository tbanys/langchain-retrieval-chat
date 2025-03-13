import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: { chatId: string } }
) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const chat = await prisma.chatHistory.findUnique({
      where: {
        id: params.chatId,
        userId: session.user.id
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!chat) {
      return new NextResponse("Chat not found", { status: 404 });
    }

    return NextResponse.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { chatId: string } }
) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { messages } = await req.json();
    const chat = await prisma.chatHistory.findUnique({
      where: {
        id: params.chatId,
        userId: session.user.id
      }
    });

    if (!chat) {
      return new NextResponse("Chat not found", { status: 404 });
    }

    // Add new messages
    await prisma.message.createMany({
      data: messages.map((msg: any) => ({
        content: msg.content,
        role: msg.role,
        chatHistoryId: params.chatId
      }))
    });

    // Update chat's updatedAt timestamp
    await prisma.chatHistory.update({
      where: {
        id: params.chatId
      },
      data: {
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating chat:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}