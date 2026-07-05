import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { ResourceFolder } from '@/models/ResourceFolder';
import { getResourceAccess, getResourceWriteAccess } from '@/lib/resourceAuth';

export async function GET(req: NextRequest) {
  try {
    const access = await getResourceAccess(req);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized - please sign in' },
        { status: 401 }
      );
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId') || null;

    const query: any = {};
    if (parentId) {
      query.parentId = parentId;
    } else {
      query.parentId = null;
    }

    const folders = await ResourceFolder.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return NextResponse.json(
      {
        success: true,
        folders,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching folders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch folders' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getResourceWriteAccess(req);
    if (!access.authorized || !access.actorId) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    await dbConnect();
    const { name, parentId } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const folder = new ResourceFolder({
      name: name.trim(),
      parentId: parentId || null,
      createdBy: access.actorId,
    });

    await folder.save();
    await folder.populate('createdBy', 'name email');

    return NextResponse.json(
      {
        success: true,
        folder,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json(
      { error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}
