import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateToken } from '@/lib/graphql/auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user as any;

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role || 'user',
    });

    return NextResponse.json({
      token,
      expiresIn: '7d',
    });
  } catch (error: any) {
    console.error('Error generating mobile token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
