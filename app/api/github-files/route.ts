import { NextRequest, NextResponse } from 'next/server';
import { getGitHubStorage } from '@/lib/github-storage';
import { verifyAdminToken } from '@/lib/adminAuth';

/**
 * GET - List files in GitHub repository
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '';

    const storage = getGitHubStorage();
    const files = await storage.listFiles(path);

    return NextResponse.json({
      success: true,
      files,
      path,
    });
  } catch (error: any) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to list files' 
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Upload file to GitHub repository
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string || '';

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'No file provided'
        },
        { status: 400 }
      );
    }

    if (path.includes('..') || file.name.includes('..') || file.name.includes('/')) {
      return NextResponse.json(
        { success: false, error: 'Invalid path or filename' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Construct full path
    const fullPath = path ? `${path}/${file.name}` : file.name;

    const storage = getGitHubStorage();
    const result = await storage.uploadFile(
      fullPath,
      buffer,
      `Upload ${file.name}`
    );

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        name: result.content.name,
        path: result.content.path,
        sha: result.content.sha,
        size: result.content.size,
        url: result.content.html_url,
        download_url: result.content.download_url,
      },
    });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to upload file' 
      },
      { status: 500 }
    );
  }
}
