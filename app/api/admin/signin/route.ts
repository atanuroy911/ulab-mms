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

    // Get admin settings
    let adminSettings = await AdminSettings.findOne();

    // If no admin settings exist or no password is set, return special flag
    if (!adminSettings || !adminSettings.passwordHash) {
      return NextResponse.json(
        { requireSetup: true, message: 'Admin password not set. Please set your password.' },
        { status: 200 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, adminSettings.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
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
      { success: true, message: 'Admin authenticated successfully' },
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
    console.error('Admin signin error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
