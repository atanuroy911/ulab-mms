'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, LogOut, ChevronRight, Download, Folder, File, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from '@/app/utils/notifications';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { teacherSidebarItems } from '@/app/components/teacherNav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface IResourceFolder {
  _id: string;
  name: string;
  parentId: string | null;
  createdBy: { name: string; email: string };
  createdAt: string;
}

interface IStoredFile {
  _id: string;
  filename: string;
  originalName: string;
  folderId: string;
  uploadedBy: { name: string; email: string };
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export default function ResourcesPage({ params }: { params: Promise<{ folderPath?: string[] }> }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [folders, setFolders] = useState<IResourceFolder[]>([]);
  const [files, setFiles] = useState<IStoredFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [breadcrumb, setBreadcrumb] = useState<IResourceFolder[]>([]);
  const [breadcrumbDisplayNames, setBreadcrumbDisplayNames] = useState<Map<string, string>>(new Map());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Clicking a folder/breadcrumb updates currentFolderId/breadcrumb/folderPath synchronously
  // *and* pushes a new URL. That URL change re-runs this params-driven effect, which would
  // otherwise re-resolve the whole path from the root via separate API calls - an async
  // re-resolution that can finish after a later click and clobber it back to an ancestor
  // folder. Count pending self-triggered navigations so this effect skips re-resolving state
  // we already know is correct, and only actually resolves from the URL for navigations we
  // didn't cause ourselves (initial load, shared link, browser back/forward).
  const pendingInternalNavs = useRef(0);

  // Authoritative, synchronously-updated mirror of breadcrumb/breadcrumbDisplayNames. React
  // state updates are batched/async, so building the next click's URL from `breadcrumb`/
  // `folderPath` state directly used a stale value if the user clicked into another folder
  // before the previous click's state had actually committed - producing duplicated URL
  // segments (e.g. /resources/Outlines/Outlines/CSE1102/CSE1102). Refs are mutated
  // immediately, so every navigation reads the true current path.
  const breadcrumbRef = useRef<IResourceFolder[]>([]);
  const displayNamesRef = useRef<Map<string, string>>(new Map());

  // Initialize folderPath from params
  useEffect(() => {
    const initPath = async () => {
      if (pendingInternalNavs.current > 0) {
        pendingInternalNavs.current -= 1;
        return;
      }

      const resolvedParams = await params;
      const path = resolvedParams.folderPath || [];

      if (path.length > 0) {
        // Resolve folder IDs from the folder names path
        await resolveFolderPath(path);
      } else {
        setCurrentFolderId(null);
        setBreadcrumb([]);
        setBreadcrumbDisplayNames(new Map());
      }
    };
    initPath();
  }, [params]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    loadFolderContents(currentFolderId);
  }, [currentFolderId]);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Resolve folder path by looking up folder names and getting their IDs
  const resolveFolderPath = async (path: string[]) => {
    try {
      let parentId: string | null = null;
      let lastFolderId: string | null = null;
      const breadcrumbItems: IResourceFolder[] = [];
      const displayNames = new Map<string, string>();

      for (const folderName of path) {
        // Decode the folder name from URL
        const decodedName = decodeURIComponent(folderName);
        
        // Fetch folders at this level
        const url: string = parentId
          ? `/api/resources/folders?parentId=${parentId}`
          : '/api/resources/folders';
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.success || !data.folders) break;

        // Find the folder with this name (handling numbered duplicates)
        let baseName = decodedName;
        let occurrence = 1;
        
        // Check if this has a [number] suffix
        const match = decodedName.match(/^(.+?)\s*\[(\d+)\]$/);
        if (match) {
          baseName = match[1];
          occurrence = parseInt(match[2], 10);
        }

        // Count occurrences and find the right one
        let occurrenceCount = 0;
        let foundFolder: IResourceFolder | null = null;

        for (const folder of data.folders) {
          if (folder.name === baseName) {
            occurrenceCount++;
            if (occurrenceCount === occurrence) {
              foundFolder = folder;
              break;
            }
          }
        }

        if (!foundFolder) break;

        parentId = foundFolder._id;
        lastFolderId = foundFolder._id;
        breadcrumbItems.push(foundFolder);
        
        // Store display name
        const totalCount = data.folders.filter((f: IResourceFolder) => f.name === baseName).length;
        const displayName = totalCount > 1 ? `${baseName} [${occurrenceCount}]` : baseName;
        displayNames.set(foundFolder._id, displayName);
      }

      breadcrumbRef.current = breadcrumbItems;
      displayNamesRef.current = displayNames;
      setCurrentFolderId(lastFolderId);
      setBreadcrumb(breadcrumbItems);
      setBreadcrumbDisplayNames(displayNames);

      // Resolution only found a prefix of the requested path (e.g. a stale/bad URL) - fix the
      // URL to match what we actually resolved instead of leaving it pointing somewhere the
      // displayed breadcrumb disagrees with.
      if (breadcrumbItems.length !== path.length) {
        const correctedPath = breadcrumbItems.map((f) => encodeURIComponent(displayNames.get(f._id) || f.name));
        pendingInternalNavs.current += 1;
        router.replace(correctedPath.length > 0 ? `/resources/${correctedPath.join('/')}` : '/resources');
      }
    } catch (err) {
      toast.error('Failed to load folder path');
    }
  };

  // Fetch a folder's subfolders and files together (in parallel, not one-after-the-other) and
  // apply both results in one atomic update. The previous version awaited folders, flipped
  // `loading` to false the moment folders arrived, THEN kicked off the files fetch - so the
  // UI revealed folders, sat still, and then files popped in a beat later. That double-reveal
  // is what read as "waits, loading sign, then goes inside" instead of a normal file browser.
  // Request-id guarded so a fast second click (navigating again before this resolves) can't
  // let a stale, slower response clobber the newer folder's contents.
  const latestContentsRequestRef = useRef(0);

  const loadFolderContents = async (folderId: string | null) => {
    const reqId = ++latestContentsRequestRef.current;
    setLoading(true);
    try {
      const foldersUrl = folderId
        ? `/api/resources/folders?parentId=${folderId}`
        : '/api/resources/folders';

      const [foldersRes, filesRes] = await Promise.all([
        fetch(foldersUrl),
        folderId ? fetch(`/api/resources/files?folderId=${folderId}`) : null,
      ]);

      if (reqId !== latestContentsRequestRef.current) return;

      const foldersData = await foldersRes.json();
      const filesData = filesRes ? await filesRes.json() : { success: true, files: [] };

      if (reqId !== latestContentsRequestRef.current) return;

      if (foldersData.success) {
        setFolders(foldersData.folders);
      } else {
        toast.error(foldersData.error || 'Failed to load folders');
      }

      if (filesData.success) {
        setFiles(filesData.files);
      } else {
        toast.error(filesData.error || 'Failed to load files');
      }
    } catch (err) {
      if (reqId === latestContentsRequestRef.current) {
        toast.error('Failed to load folder contents');
      }
    } finally {
      if (reqId === latestContentsRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const searchLower = debouncedSearch.toLowerCase();
  const displayedFolders = useMemo(() => {
    if (!debouncedSearch) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(searchLower));
  }, [folders, debouncedSearch]);

  const displayedFiles = useMemo(() => {
    if (!debouncedSearch) return files;
    return files.filter((fl) => fl.originalName.toLowerCase().includes(searchLower));
  }, [files, debouncedSearch]);

  const folderDisplayNames = useMemo(() => {
    const nameCounts = new Map<string, number>();
    const displayNames = new Map<string, string>();

    folders.forEach((folder) => {
      const count = nameCounts.get(folder.name) || 0;
      nameCounts.set(folder.name, count + 1);
    });

    const seen = new Map<string, number>();
    folders.forEach((folder) => {
      const total = nameCounts.get(folder.name) || 0;
      const occurrence = (seen.get(folder.name) || 0) + 1;
      seen.set(folder.name, occurrence);
      displayNames.set(folder._id, total > 1 ? `${folder.name} [${occurrence}]` : folder.name);
    });

    return displayNames;
  }, [folders]);

  const navigateToFolder = (folderId: string, folderName: string) => {
    // Don't clear files/folders here - keep the current view visible until
    // loadFolderContents (triggered below by the currentFolderId change) swaps both in at
    // once, so the transition doesn't flash empty before the new folder's contents arrive.
    const displayName = folderDisplayNames.get(folderId) || folderName;

    // Read/write the refs (not state) so this always builds on the true current path, even
    // if the previous click's state update hasn't committed yet.
    const nextBreadcrumb = [...breadcrumbRef.current, { _id: folderId, name: folderName } as IResourceFolder];
    const nextDisplayNames = new Map(displayNamesRef.current).set(folderId, displayName);
    breadcrumbRef.current = nextBreadcrumb;
    displayNamesRef.current = nextDisplayNames;

    const newPath = nextBreadcrumb.map((f) => encodeURIComponent(nextDisplayNames.get(f._id) || f.name));

    pendingInternalNavs.current += 1;
    router.push(`/resources/${newPath.join('/')}`);

    setCurrentFolderId(folderId);
    setBreadcrumb(nextBreadcrumb);
    setBreadcrumbDisplayNames(nextDisplayNames);
  };

  const navigateTo = (index: number) => {
    if (index === -1) {
      // Navigate to root
      breadcrumbRef.current = [];
      displayNamesRef.current = new Map();

      pendingInternalNavs.current += 1;
      router.push('/resources');

      setCurrentFolderId(null);
      setBreadcrumb([]);
      setBreadcrumbDisplayNames(new Map());
    } else {
      const newBreadcrumb = breadcrumbRef.current.slice(0, index + 1);
      const newDisplayNames = new Map(displayNamesRef.current);
      breadcrumbRef.current.slice(index + 1).forEach((f) => newDisplayNames.delete(f._id));

      breadcrumbRef.current = newBreadcrumb;
      displayNamesRef.current = newDisplayNames;

      const newPath = newBreadcrumb.map((f) => encodeURIComponent(newDisplayNames.get(f._id) || f.name));

      pendingInternalNavs.current += 1;
      router.push(`/resources/${newPath.join('/')}`);

      setCurrentFolderId(newBreadcrumb[newBreadcrumb.length - 1]._id);
      setBreadcrumb(newBreadcrumb);
      setBreadcrumbDisplayNames(newDisplayNames);
    }
  };

  const downloadFile = (fileId: string, fileName: string) => {
    window.location.href = `/api/resources/files/${fileId}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      <AdminSidebar items={teacherSidebarItems} title="Teacher Portal" />

      <div className="flex-1 flex flex-col">
        <nav className="border-b bg-background sticky top-0 z-30">
          <div className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 pl-16 md:pl-6">
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Resources</h1>
              <p className="text-xs text-muted-foreground truncate">Welcome, {session?.user?.name}</p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <ThemeToggle />
              <Button variant="default" size="sm" asChild>
                <Link href="/capstone">
                  <FlaskConical className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Capstone</span>
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  notify.auth.signOutSuccess();
                  signOut({ callbackUrl: '/auth/signin' });
                }}
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </nav>

        <main className="flex-1 overflow-auto">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigateTo(-1)}
              className="text-blue-600 hover:underline dark:text-blue-400 font-medium"
            >
              Resources
            </button>
            {breadcrumb.map((folder, index) => (
              <div key={folder._id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <button
                  onClick={() => navigateTo(index)}
                  className="text-blue-600 hover:underline dark:text-blue-400 font-medium"
                >
                  {breadcrumbDisplayNames.get(folder._id) || folder.name}
                </button>
              </div>
            ))}
            {/* Small inline indicator instead of blanking the page - the current folder's
                contents stay visible until the next folder's contents are ready to swap in. */}
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search folders or files"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <Button variant="ghost" onClick={() => setSearchQuery('')}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {/* Folders Section */}
          {displayedFolders.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Folders</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedFolders.map((folder) => (
                  <button
                    key={folder._id}
                    onClick={() => navigateToFolder(folder._id, folder.name)}
                    className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Folder className="w-6 h-6 text-blue-500" />
                      <h3 className="font-medium text-lg truncate">{folderDisplayNames.get(folder._id) || folder.name}</h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Created: {formatDate(folder.createdAt)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files Section */}
          {displayedFiles.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Files</h2>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                          Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                          Uploaded
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {displayedFiles.map((file) => (
                        <tr key={file._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <File className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium truncate">{file.originalName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {formatFileSize(file.fileSize)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(file.createdAt)}
                          </td>
                          <td className="px-6 py-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadFile(file._id, file.originalName)}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Empty State - only once we're sure there's genuinely nothing here, not mid-fetch */}
          {!loading && folders.length === 0 && files.length === 0 && (
            <div className="text-center py-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-md">
                <Folder className="h-7 w-7" />
              </div>
              <p className="text-muted-foreground">
                {currentFolderId ? 'This folder is empty' : 'No resources available yet'}
              </p>
            </div>
          )}

          {/* First-ever load only (no stale content to keep showing in the meantime) - later
              navigations are covered by the small inline spinner next to the breadcrumb above,
              so the current folder's contents stay on screen until the new ones are ready. */}
          {loading && folders.length === 0 && files.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <Skeleton className="h-8 w-8 rounded shrink-0" />
                  <Skeleton className="h-4 flex-1 max-w-xs" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
        </main>
      </div>
    </div>
  );
}
