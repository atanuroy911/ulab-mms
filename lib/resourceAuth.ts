import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import { verifyAdminToken } from '@/lib/adminAuth';

export type ResourceAccess = {
  authorized: boolean;
  actorId: string | null;
};

export async function getResourceAccess(
  request: NextRequest
): Promise<ResourceAccess> {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    return {
      authorized: true,
      actorId: session.user.id,
    };
  }

  const hasAdminToken = await verifyAdminToken(request);
  if (!hasAdminToken) {
    return {
      authorized: false,
      actorId: null,
    };
  }

  await dbConnect();
  const adminSettings = await AdminSettings.findOne().select('_id');

  return {
    authorized: Boolean(adminSettings?._id),
    actorId: adminSettings?._id ? adminSettings._id.toString() : null,
  };
}

// The shared "common file directory" is admin-managed: any signed-in teacher can browse/
// download (getResourceAccess above), but creating/renaming/deleting folders or uploading/
// deleting files is restricted to the admin panel to prevent one teacher from tampering with
// or wiping another teacher's/the admin's shared materials.
export async function getResourceWriteAccess(request: NextRequest): Promise<ResourceAccess> {
  const hasAdminToken = await verifyAdminToken(request);
  if (!hasAdminToken) {
    return { authorized: false, actorId: null };
  }

  await dbConnect();
  const adminSettings = await AdminSettings.findOne().select('_id');

  return {
    authorized: Boolean(adminSettings?._id),
    actorId: adminSettings?._id ? adminSettings._id.toString() : null,
  };
}