import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

import { ADMIN_JWT_SECRET as SECRET } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get admin settings
    let adminSettings = await AdminSettings.findOne();

    // Only allow setup if password is not already set
    if (adminSettings && adminSettings.passwordHash) {
      return NextResponse.json(
        { error: 'Admin password is already set. Use change password instead.' },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create or update admin settings
    if (adminSettings) {
      adminSettings.passwordHash = hashedPassword;
      await adminSettings.save();
    } else {
      adminSettings = await AdminSettings.create({
        username: 'admin',
        passwordHash: hashedPassword,
      });
    }

    // Create JWT token
    const token = await new SignJWT({ 
      username: 'admin', 
      role: 'admin',
      type: 'admin' 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30m')
      .setIssuedAt()
      .sign(SECRET);

    const response = NextResponse.json(
      { success: true, message: 'Admin password set successfully' },
      { status: 200 }
    );

    // Set HTTP-only cookie
    response.cookies.set('admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 30, // 30 minutes
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Admin setup password error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
