import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { ResourceFolder } from '@/models/ResourceFolder';
import { StoredFile } from '@/models/StoredFile';
import mongoose from 'mongoose';
import { getResourceWriteAccess } from '@/lib/resourceAuth';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await getResourceWriteAccess(req);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid folder ID' },
        { status: 400 }
      );
    }

    const { name } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const folder = await ResourceFolder.findByIdAndUpdate(
      id,
      { name: name.trim() },
      { new: true }
    ).populate('createdBy', 'name email');

    if (!folder) {
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        folder,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating folder:', error);
    return NextResponse.json(
      { error: 'Failed to update folder' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await getResourceWriteAccess(req);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid folder ID' },
        { status: 400 }
      );
    }

    // Recursively find all subfolders
    const getAllSubfolders = async (parentId: string): Promise<string[]> => {
      const subfolders = await ResourceFolder.find({ parentId });
      const allIds = [parentId];

      for (const subfolder of subfolders) {
        const subIds = await getAllSubfolders(subfolder._id.toString());
        allIds.push(...subIds);
      }

      return allIds;
    };

    const allFolderIds = await getAllSubfolders(id);

    // Delete all files in this folder and subfolders
    await StoredFile.deleteMany({
      folderId: { $in: allFolderIds.map(fId => new mongoose.Types.ObjectId(fId)) },
    });

    // Delete all subfolders
    await ResourceFolder.deleteMany({
      parentId: { $in: allFolderIds.slice(1).map(fId => new mongoose.Types.ObjectId(fId)) },
    });

    // Delete the main folder
    const deletedFolder = await ResourceFolder.findByIdAndDelete(id);

    if (!deletedFolder) {
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Folder and all its contents deleted successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json(
      { error: 'Failed to delete folder' },
      { status: 500 }
    );
  }
}
