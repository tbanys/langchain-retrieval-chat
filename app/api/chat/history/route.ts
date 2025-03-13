import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession({ req, res: NextResponse, ...authOptions });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const chatHistories = await prisma.chatHistory.findMany({
      where: { userId: session.user.id },
      include: { messages: true },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(chatHistories);
  } catch (error) {
    console.error('Failed to fetch chat histories', error);
    return NextResponse.json({ error: 'Failed to fetch chat histories' }, { status: 500 });
  }
}