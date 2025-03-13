import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type RouteParams = {
  params: {
    id: string;
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const chatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: params.id,
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
    if (!chatHistory) {
      return NextResponse.json({ message: "Chat history not found" }, { status: 404 });
    }
    return NextResponse.json(chatHistory);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return NextResponse.json(
      { message: "Failed to fetch chat history" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const existingChatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    });
    if (!existingChatHistory) {
      return NextResponse.json({ message: "Chat history not found" }, { status: 404 });
    }
    const { title, messages } = await request.json();
    
    const updatedChatHistory = await prisma.chatHistory.update({
      where: {
        id: params.id
      },
      data: {
        title: title || undefined,
        ...(messages && {
          messages: {
            create: messages.map((message: any) => ({
              content: message.content,
              role: message.role
            }))
          }
        })
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });
    return NextResponse.json(updatedChatHistory);
  } catch (error) {
    console.error("Error updating chat history:", error);
    return NextResponse.json(
      { message: "Failed to update chat history" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const existingChatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    });
    if (!existingChatHistory) {
      return NextResponse.json({ message: "Chat history not found" }, { status: 404 });
    }
    await prisma.chatHistory.delete({
      where: {
        id: params.id
      }
    });
    return NextResponse.json({ message: "Chat history deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat history:", error);
    return NextResponse.json(
      { message: "Failed to delete chat history" },
      { status: 500 }
    );
  }
}