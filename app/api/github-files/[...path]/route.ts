import { NextRequest, NextResponse } from 'next/server';
import { getGitHubStorage } from '@/lib/github-storage';
import { verifyAdminToken } from '@/lib/adminAuth';

function isPathTraversal(segments: string[]): boolean {
  return segments.some((segment) => segment === '..' || segment === '' || segment.includes('/'));
}

/**
 * GET - Download a file from GitHub repository
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const resolvedParams = await params;
    if (isPathTraversal(resolvedParams.path)) {
      return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
    }
    const filePath = resolvedParams.path.join('/');

    const storage = getGitHubStorage();
    
    // Get file details first
    const fileInfo = await storage.getFile(filePath);
    
    // Download file content
    const buffer = await storage.downloadFile(filePath);

    // Determine content type from file extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentType = getContentType(ext || '');

    // Convert buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileInfo.name}"`,
        'Content-Length': uint8Array.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to download file' 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a file from GitHub repository
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const resolvedParams = await params;
    if (isPathTraversal(resolvedParams.path)) {
      return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
    }
    const filePath = resolvedParams.path.join('/');

    const storage = getGitHubStorage();
    await storage.deleteFile(filePath, `Delete ${filePath}`);

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to delete file' 
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to get content type from file extension
 */
function getContentType(ext: string): string {
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    zip: 'application/zip',
  };
  
  return types[ext] || 'application/octet-stream';
}
