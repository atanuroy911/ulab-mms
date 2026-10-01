import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import bcrypt from 'bcryptjs';

import { setAdminSession } from '@/lib/adminSession';

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

    const response = NextResponse.json(
      { success: true, message: 'Admin password set successfully' },
      { status: 200 }
    );
    await setAdminSession(response, { mfa: false });

    return response;
  } catch (error: any) {
    console.error('Admin setup password error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
