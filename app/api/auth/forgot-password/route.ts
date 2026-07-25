import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { isValidEmail } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Validate email is provided
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Always respond with the same generic message regardless of whether the email is
    // registered - returning a distinct 404 for unknown emails lets an attacker enumerate
    // every registered account by trying addresses one at a time.
    const genericResponse = NextResponse.json(
      { message: 'If an account exists with this email, a reset link has been sent.' },
      { status: 200 }
    );

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return genericResponse;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    user.passwordResetToken = resetTokenHash;
    user.passwordResetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Create reset link - use user.email from database to ensure consistency
    const resetLink = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Try to send email if credentials are configured
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
          },
          connectionUrl: 'smtps://smtp.gmail.com',
        });

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Password Reset Request - Marks Management System',
          html: `
            <h2>Password Reset Request</h2>
            <p>You have requested to reset your password. Click the link below to proceed:</p>
            <p>
              <a href="${resetLink}" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p>Or copy and paste this link in your browser:</p>
            <p>${resetLink}</p>
            <p>This link will expire in 30 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
          `,
        };

        await transporter.sendMail(mailOptions);
      } catch (emailError: any) {
        console.error('Email sending failed:', emailError.message || emailError);
        // Still return success even if email fails, as the token is saved
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // Log the reset link if email is not configured, dev-only convenience.
      console.log('Reset Link (email not configured):', resetLink);
    }

    return genericResponse;
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process reset request' },
      { status: 500 }
    );
  }
}
