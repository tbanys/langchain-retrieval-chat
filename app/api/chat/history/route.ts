import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Get all chat history for a user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const chatHistories = await prisma.chatHistory.findMany({
      where: {
        userId: session.user.id
      },
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'asc'
          },
          select: {
            content: true
          }
        }
      }
    });

    return NextResponse.json(chatHistories);
  } catch (error) {
    console.error("Error fetching chat histories:", error);
    return NextResponse.json(
      { message: "Failed to fetch chat histories" },
      { status: 500 }
    );
  }
}

// Create a new chat history entry
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { title, messages } = await req.json();
    const chatHistory = await prisma.chatHistory.create({
      data: {
        title: title || "New Chat",
        userId: session.user.id,
        messages: {
          create: messages.map((message: any) => ({
            content: message.content,
            role: message.role
          }))
        }
      },
      include: {
        messages: true
      }
    });

    return NextResponse.json(chatHistory, { status: 201 });
  } catch (error) {
    console.error("Error creating chat history:", error);
    return NextResponse.json(
      { message: "Failed to create chat history" },
      { status: 500 }
    );
  }
}