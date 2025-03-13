import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession({ req, res: NextResponse, ...authOptions });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const newChat = await prisma.chatHistory.create({
      data: {
        userId: session.user.id,
      },
    });

    return NextResponse.json(newChat);
  } catch (error) {
    console.error('Failed to create new chat', error);
    return NextResponse.json({ error: 'Failed to create new chat' }, { status: 500 });
  }
}