import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest, context: any) {
  const { params } = context;
  
  const session = await getServerSession({ req, res: NextResponse, ...authOptions });
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const chatHistory = await prisma.chatHistory.findUnique({
      where: {
        id: params.chatId,
        userId: session.user.id,
      },
      include: { messages: true },
    });

    if (!chatHistory) {
      return NextResponse.json({ error: 'Chat history not found' }, { status: 404 });
    }

    return NextResponse.json(chatHistory);
  } catch (error) {
    console.error('Failed to fetch chat history', error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
}