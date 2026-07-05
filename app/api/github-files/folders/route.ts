import { NextRequest, NextResponse } from 'next/server';
import { getGitHubStorage } from '@/lib/github-storage';
import { verifyAdminToken } from '@/lib/adminAuth';

/**
 * POST - Create a new folder in GitHub repository
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const body = await request.json();
    const { folderName, path } = body;

    if (!folderName) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Folder name is required' 
        },
        { status: 400 }
      );
    }

    // Validate folder name
    if (!/^[a-zA-Z0-9_-]+$/.test(folderName)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Folder name can only contain letters, numbers, hyphens, and underscores' 
        },
        { status: 400 }
      );
    }

    // Construct folder path
    const folderPath = path ? `${path}/${folderName}` : folderName;
    
    // GitHub doesn't support empty folders, so we create a .gitkeep file
    const gitkeepPath = `${folderPath}/.gitkeep`;

    const storage = getGitHubStorage();
    const result = await storage.uploadFile(
      gitkeepPath,
      '# This file keeps the folder in Git',
      `Create folder ${folderName}`
    );

    return NextResponse.json({
      success: true,
      message: 'Folder created successfully',
      folder: {
        name: folderName,
        path: folderPath,
      },
    });
  } catch (error: any) {
    console.error('Error creating folder:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to create folder' 
      },
      { status: 500 }
    );
  }
}
