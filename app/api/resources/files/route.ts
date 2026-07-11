import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { StoredFile } from '@/models/StoredFile';
import { ResourceFolder } from '@/models/ResourceFolder';
import mongoose from 'mongoose';
import { getResourceAccess, getResourceWriteAccess } from '@/lib/resourceAuth';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB - files are stored as Mongo documents

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
    const folderId = searchParams.get('folderId');

    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      return NextResponse.json(
        { error: 'Invalid folder ID' },
        { status: 400 }
      );
    }

    const files = await StoredFile.find({ folderId })
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 });

    return NextResponse.json(
      {
        success: true,
        files: files.map(file => ({
          _id: file._id,
          filename: file.filename,
          originalName: file.originalName,
          folderId: file.folderId,
          uploadedBy: file.uploadedBy,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          createdAt: file.createdAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files' },
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
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File is too large. Maximum size is 25MB.' },
        { status: 413 }
      );
    }

    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      return NextResponse.json(
        { error: 'Invalid folder ID' },
        { status: 400 }
      );
    }

    // Verify folder exists
    const folder = await ResourceFolder.findById(folderId);
    if (!folder) {
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    const filename = `${Date.now()}-${file.name}`;

    const storedFile = new StoredFile({
      filename,
      originalName: file.name,
      folderId,
      uploadedBy: access.actorId,
      fileSize: file.size,
      mimeType: file.type,
      fileData: Buffer.from(fileBuffer),
    });

    await storedFile.save();
    await storedFile.populate('uploadedBy', 'name email');

    return NextResponse.json(
      {
        success: true,
        file: {
          _id: storedFile._id,
          filename: storedFile.filename,
          originalName: storedFile.originalName,
          folderId: storedFile.folderId,
          uploadedBy: storedFile.uploadedBy,
          fileSize: storedFile.fileSize,
          mimeType: storedFile.mimeType,
          createdAt: storedFile.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
