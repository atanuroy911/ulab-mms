'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Download, FileText, ArrowLeft, Trash2, Loader2 } from 'lucide-react';
import { AppHeader } from '@/app/components/AppHeader';

interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

export default function UserFilesPage({ params }: { params: Promise<{ username: string }> }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Home' },
  ]);

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setUsername(resolvedParams.username);
    };
    getParams();
  }, [params]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchFiles();
    }
  }, [session, selectedFolderId]);

  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      
      // Fetch folders
      const foldersUrl = new URL('/api/files/folders', window.location.origin);
      if (selectedFolderId) {
        foldersUrl.searchParams.append('parentFolderId', selectedFolderId);
      }
      const foldersResponse = await fetch(foldersUrl.toString());
      if (foldersResponse.ok) {
        const foldersData = await foldersResponse.json();
        setFolders(foldersData.folders || []);
      }

      // Fetch files
      const filesUrl = new URL('/api/files', window.location.origin);
      if (selectedFolderId) {
        filesUrl.searchParams.append('folderId', selectedFolderId);
      }
      const filesResponse = await fetch(filesUrl.toString());
      if (!filesResponse.ok) throw new Error('Failed to fetch files');
      const data = await filesResponse.json();
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch files');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      setDownloadingId(fileId);
      const response = await fetch(`/api/files/${fileId}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
    } finally {
      setDownloadingId('');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    // This function is no longer used - file deletion is handled from the admin dashboard
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
    return '📎';
  };

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setSelectedFolderId(folderId);
    
    if (folderId === null) {
      // Navigate to root
      setBreadcrumbs([{ id: null, name: 'Home' }]);
    } else {
      // Check if we're navigating back via breadcrumb
      const existingIndex = breadcrumbs.findIndex(b => b.id === folderId);
      if (existingIndex !== -1) {
        // We're clicking on a breadcrumb - go back to that level
        setBreadcrumbs(breadcrumbs.slice(0, existingIndex + 1));
      } else {
        // We're going deeper - add this folder to breadcrumbs
        setBreadcrumbs([
          ...breadcrumbs,
          { id: folderId, name: folderName },
        ]);
      }
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Available Files"
        subtitle="Download resources uploaded by administrators"
        gradient="blue"
        actions={[
          { key: 'dashboard', label: 'Back to Dashboard', icon: ArrowLeft, href: '/dashboard', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      {/* Main Content */}
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-card border rounded-lg shadow-lg p-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">Download Resources</h2>
              <p className="text-muted-foreground">All files uploaded by administrators are available below</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-destructive">{error}</p>
              </div>
            )}

            {deleteError && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-destructive">{deleteError}</p>
              </div>
            )}

            {/* Breadcrumb Navigation */}
            <div className="mb-6 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 flex-wrap">
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.id || 'root'} className="flex items-center gap-2">
                    <button
                      onClick={() => navigateToFolder(crumb.id, crumb.name)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        index === breadcrumbs.length - 1
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/10'
                      }`}
                    >
                      {crumb.name}
                    </button>
                    {index < breadcrumbs.length - 1 && (
                      <span className="text-muted-foreground">/</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Folders Display */}
            {folders.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Folders</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => navigateToFolder(folder.id, folder.name)}
                      className="p-4 border-2 border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-colors text-center group"
                    >
                      <div className="text-4xl mb-2">📁</div>
                      <p className="font-medium truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {folder.name}
                      </p>
                    </button>
                  ))}
                </div>
                <hr className="my-8 border-border" />
              </div>
            )}

            <div>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading files...</div>
              ) : files.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">No files available yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-bold">Filename</TableHead>
                      <TableHead className="font-bold">Size</TableHead>
                      <TableHead className="font-bold">Uploaded By</TableHead>
                      <TableHead className="font-bold">Uploaded At</TableHead>
                      <TableHead className="text-right font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell className="font-medium">
                            <span className="mr-2">{getFileIcon(file.mimeType)}</span>
                            {file.originalName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatFileSize(file.size)}</TableCell>
                          <TableCell className="text-muted-foreground">{file.uploadedBy}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(file.uploadedAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                onClick={() => handleDownload(file.id, file.originalName)}
                                disabled={downloadingId === file.id}
                                className="gap-2"
                              >
                                <Download className="w-4 h-4" />
                                {downloadingId === file.id ? 'Downloading...' : 'Download'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
