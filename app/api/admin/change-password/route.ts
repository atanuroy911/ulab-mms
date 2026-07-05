import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';

import { ADMIN_JWT_SECRET as SECRET } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  try {
    // Verify admin token
    const token = request.cookies.get('admin-token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    try {
      const { payload } = await jwtVerify(token, SECRET);
      if (payload.type !== 'admin') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    await dbConnect();

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get admin settings
    const adminSettings = await AdminSettings.findOne();

    if (!adminSettings || !adminSettings.passwordHash) {
      return NextResponse.json(
        { error: 'Admin password not set' },
        { status: 400 }
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, adminSettings.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    adminSettings.passwordHash = hashedPassword;
    await adminSettings.save();

    return NextResponse.json(
      { success: true, message: 'Password changed successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Admin change password error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
