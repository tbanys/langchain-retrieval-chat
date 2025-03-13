import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Get specific chat history by ID
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const chatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: context.params.id,
        userId: session.user.id // Ensure the chat belongs to this user
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

// Update a chat history entry
export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if the chat history exists and belongs to the user
    const existingChatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: context.params.id,
        userId: session.user.id
      }
    });

    if (!existingChatHistory) {
      return NextResponse.json({ message: "Chat history not found" }, { status: 404 });
    }

    const { title, messages } = await request.json();
    
    // Update chat history
    const updatedChatHistory = await prisma.chatHistory.update({
      where: {
        id: context.params.id
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

// Delete a chat history entry
export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if the chat history exists and belongs to the user
    const existingChatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: context.params.id,
        userId: session.user.id
      }
    });

    if (!existingChatHistory) {
      return NextResponse.json({ message: "Chat history not found" }, { status: 404 });
    }

    // Delete the chat history
    await prisma.chatHistory.delete({
      where: {
        id: context.params.id
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