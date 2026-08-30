"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Upload,
  Download,
  Trash2,
  File,
  Folder,
  FolderPlus,
  Edit2,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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

export default function ResourcesManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [folders, setFolders] = useState<IResourceFolder[]>([]);
  const [files, setFiles] = useState<IStoredFile[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<IResourceFolder[]>([]);
  const [breadcrumbDisplayNames, setBreadcrumbDisplayNames] = useState<Map<string, string>>(new Map());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Dialogs / editing
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "folder" | "file";
    id: string;
    name: string;
  } | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [savingFolderEdit, setSavingFolderEdit] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Initialize from query params
  useEffect(() => {
    const folderId = searchParams.get('folderId');
    if (folderId) {
      setCurrentFolderId(folderId);
    }
  }, [searchParams]);
  
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadFolders();
  }, [currentFolderId]);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const url = currentFolderId ? `/api/resources/folders?parentId=${currentFolderId}` : "/api/resources/folders";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setFolders(data.folders);
        if (currentFolderId) {
          loadFiles(currentFolderId);
        } else {
          setFiles([]);
        }
      } else {
        toast.error(data.error || "Failed to load folders");
      }
    } catch (err) {
      toast.error("Failed to load folders");
    } finally {
      setLoading(false);
    }
  };

  const latestFilesRequestRef = useRef(0);
  const loadFiles = async (folderId: string) => {
    const reqId = ++latestFilesRequestRef.current;
    try {
      const res = await fetch(`/api/resources/files?folderId=${folderId}`);
      const data = await res.json();
      if (reqId !== latestFilesRequestRef.current) return;
      if (data.success) setFiles(data.files);
      else toast.error(data.error || "Failed to load files");
    } catch (err) {
      if (reqId === latestFilesRequestRef.current) toast.error("Failed to load files");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return toast.error("Folder name is required");
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/resources/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolderId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Folder created");
        setNewFolderName("");
        setShowCreateFolder(false);
        setTimeout(() => loadFolders(), 800);
      } else toast.error(data.error);
    } catch (err) {
      toast.error("Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentFolderId) return toast.error("Please select a folder first");
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folderId", currentFolderId);
        await fetch("/api/resources/files", { method: "POST", body: fd });
      }
      toast.success("Upload complete");
      setTimeout(() => loadFiles(currentFolderId!), 800);
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    setDeletingItem(true);
    try {
      const url = deleteTarget.type === "folder" ? `/api/resources/folders/${deleteTarget.id}` : `/api/resources/files/${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Deleted");
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
        setTimeout(() => loadFolders(), 800);
      } else toast.error(data.error);
    } catch (err) {
      toast.error("Delete failed");
    } finally {
      setDeletingItem(false);
    }
  };

  const handleEditFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) return toast.error("Folder name is required");
    setSavingFolderEdit(true);
    try {
      const res = await fetch(`/api/resources/folders/${folderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingFolderName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Folder updated");
        setEditingFolderId(null);
        setEditingFolderName("");
        setTimeout(() => loadFolders(), 800);
      } else toast.error(data.error);
    } catch (err) {
      toast.error("Update failed");
    } finally {
      setSavingFolderEdit(false);
    }
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setFiles([]);
    const displayName = folderDisplayNames.get(folderId) || folderName;
    setCurrentFolderId(folderId);
    setBreadcrumb((b) => [...b, { _id: folderId, name: folderName } as IResourceFolder]);
    setBreadcrumbDisplayNames((m) => new Map(m).set(folderId, displayName));
    
    // Update URL with folderId query param
    const params = new URLSearchParams(searchParams);
    params.set('folderId', folderId);
    router.push(`?${params.toString()}`);
  };

  const navigateTo = (index: number) => {
    setFiles([]);
    if (index === -1) {
      setCurrentFolderId(null);
      setBreadcrumb([]);
      setBreadcrumbDisplayNames(new Map());
      // Clear folderId from URL
      const params = new URLSearchParams(searchParams);
      params.delete('folderId');
      const queryString = params.toString();
      router.push(queryString ? `?${queryString}` : '?tab=resources');
    } else {
      setCurrentFolderId(breadcrumb[index]._id);
      setBreadcrumb(breadcrumb.slice(0, index + 1));
      const newDisplayNames = new Map(breadcrumbDisplayNames);
      breadcrumb.slice(index + 1).forEach((f) => newDisplayNames.delete(f._id));
      setBreadcrumbDisplayNames(newDisplayNames);
      
      // Update URL with the folder ID at this index
      const params = new URLSearchParams(searchParams);
      params.set('folderId', breadcrumb[index]._id);
      router.push(`?${params.toString()}`);
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Resources Manager</CardTitle>
          <CardDescription>Manage hierarchical folder structure and files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigateTo(-1)} className="text-blue-600 hover:underline dark:text-blue-400">
              Root
            </button>
            {breadcrumb.map((folder, index) => (
              <div key={folder._id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <button onClick={() => navigateTo(index)} className="text-blue-600 hover:underline dark:text-blue-400">
                  {breadcrumbDisplayNames.get(folder._id) || folder.name}
                </button>
              </div>
            ))}
          </div>

          {/* Actions + Search */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setShowCreateFolder(true)} disabled={loading} variant="outline">
              <FolderPlus className="w-4 h-4 mr-2" /> New Folder
            </Button>

            <div className="flex-1 min-w-[220px]">
              <Input placeholder="Search folders or files" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <div className="relative">
              <Input type="file" multiple onChange={handleUploadFile} disabled={uploading || !currentFolderId} className="hidden" id="file-upload" />
              <Button onClick={() => document.getElementById("file-upload")?.click()} disabled={uploading || !currentFolderId} variant="outline">
                <Upload className="w-4 h-4 mr-2" /> {uploading ? "Uploading..." : "Upload Files"}
              </Button>
            </div>
          </div>

          {!currentFolderId && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-300">Create a folder to get started. You can only upload files to folders.</p>
            </div>
          )}

          {/* Folders */}
          {displayedFolders.length > 0 ? (
            <div>
              <h3 className="font-semibold mb-2">Folders</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {displayedFolders.map((folder) => (
                  <div key={folder._id} className="border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    {editingFolderId === folder._id ? (
                      <div className="space-y-2">
                        <Input value={editingFolderName} onChange={(e) => setEditingFolderName(e.target.value)} placeholder="Folder name" disabled={savingFolderEdit} />
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => handleEditFolder(folder._id)} disabled={savingFolderEdit} className="flex-1">
                            {savingFolderEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingFolderId(null)} disabled={savingFolderEdit} className="flex-1"><X className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => navigateToFolder(folder._id, folder.name)} className="w-full text-left mb-2 flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400">
                          <Folder className="w-5 h-5" />
                          <span className="font-medium truncate">{folderDisplayNames.get(folder._id) || folder.name}</span>
                        </button>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingFolderId(folder._id); setEditingFolderName(folder.name); }}><Edit2 className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { setDeleteTarget({ type: 'folder', id: folder._id, name: folder.name }); setShowDeleteConfirm(true); }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : debouncedSearch ? (
            <div className="p-4 text-sm text-gray-600">No folders match "{debouncedSearch}"</div>
          ) : null}

          {/* Files */}
          {displayedFiles.length > 0 ? (
            <div>
              <h3 className="font-semibold mb-2">Files</h3>
              <div className="border rounded-lg">
                {displayedFiles.map((file, index) => (
                  <div key={file._id} className={`flex items-center justify-between p-3 ${index !== displayedFiles.length - 1 ? 'border-b' : ''}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <File className="w-5 h-5 flex-shrink-0 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.originalName}</p>
                        <p className="text-sm text-gray-600">{formatFileSize(file.fileSize)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => (window.location.href = `/api/resources/files/${file._id}`)}><Download className="w-4 h-4 mr-2" />Download</Button>
                      <Button size="sm" variant="destructive" onClick={() => { setDeleteTarget({ type: 'file', id: file._id, name: file.originalName }); setShowDeleteConfirm(true); }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : debouncedSearch ? (
            <div className="p-4 text-sm text-gray-600">No files match "{debouncedSearch}"</div>
          ) : null}

        </CardContent>
      </Card>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolder} onOpenChange={(open) => !creatingFolder && setShowCreateFolder(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>Name</Label>
            <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" disabled={creatingFolder} />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowCreateFolder(false)} disabled={creatingFolder}>Cancel</Button>
            <Button onClick={handleCreateFolder} disabled={creatingFolder}>
              {creatingFolder ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>) : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => !deletingItem && setShowDeleteConfirm(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete {deleteTarget?.type} "{deleteTarget?.name}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deletingItem}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteItem} disabled={deletingItem}>
              {deletingItem ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>) : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
