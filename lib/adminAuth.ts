import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET must be set - admin auth cannot fall back to a hardcoded secret');
}

export const ADMIN_JWT_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
const SECRET = ADMIN_JWT_SECRET;

/**
 * Verifies if the request has a valid admin token
 * @param request - The Next.js request object
 * @returns true if the request has a valid admin token, false otherwise
 */
export async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  try {
    const token = request.cookies.get('admin-token')?.value;

    if (!token) {
      return false;
    }

    const { payload } = await jwtVerify(token, SECRET);
    
    if (payload.type !== 'admin') {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error verifying admin token:', error);
    return false;
  }
}
