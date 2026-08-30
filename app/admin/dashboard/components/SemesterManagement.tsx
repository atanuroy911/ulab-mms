'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Semester {
  _id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export default function SemesterManagement() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    isActive: true,
  });

  useEffect(() => {
    fetchSemesters();
  }, []);

  const fetchSemesters = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/semesters');
      if (!response.ok) throw new Error('Failed to fetch semesters');
      const data = await response.json();
      setSemesters(data);
    } catch (error) {
      console.error('Error fetching semesters:', error);
      toast.error('Failed to load semesters');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (semester?: Semester) => {
    if (semester) {
      setIsEditMode(true);
      setEditingId(semester._id);
      setFormData({
        name: semester.name,
        description: semester.description,
        startDate: semester.startDate ? new Date(semester.startDate).toISOString().split('T')[0] : '',
        endDate: semester.endDate ? new Date(semester.endDate).toISOString().split('T')[0] : '',
        isActive: semester.isActive,
      });
    } else {
      setIsEditMode(false);
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        startDate: '',
        endDate: '',
        isActive: true,
      });
    }
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Semester name is required');
      return;
    }

    setSubmitting(true);
    try {
      const url = isEditMode
        ? `/api/admin/semesters/${editingId}`
        : '/api/admin/semesters';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          startDate: formData.startDate || null,
          endDate: formData.endDate || null,
          isActive: formData.isActive,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save semester');
      }

      toast.success(
        isEditMode
          ? 'Semester updated successfully'
          : 'Semester created successfully'
      );
      setShowDialog(false);
      fetchSemesters();
    } catch (error: any) {
      console.error('Error saving semester:', error);
      toast.error(error.message || 'Failed to save semester');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this semester?')) {
      return;
    }

    setDeleting(id);
    try {
      const response = await fetch(`/api/admin/semesters/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete semester');
      }

      toast.success('Semester deleted successfully');
      fetchSemesters();
    } catch (error) {
      console.error('Error deleting semester:', error);
      toast.error('Failed to delete semester');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Semester Management</CardTitle>
            <CardDescription>
              Create and manage capstone semesters
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Semester
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {semesters.length > 0 ? (
            semesters.map((semester) => (
              <div
                key={semester._id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-grow">
                  <h4 className="font-semibold">{semester.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {semester.description}
                  </p>
                  {(semester.startDate || semester.endDate) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {semester.startDate &&
                        `Start: ${new Date(semester.startDate).toLocaleDateString()}`}
                      {semester.startDate && semester.endDate && ' • '}
                      {semester.endDate &&
                        `End: ${new Date(semester.endDate).toLocaleDateString()}`}
                    </p>
                  )}
                  <div className="mt-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        semester.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {semester.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDialog(semester)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(semester._id)}
                    disabled={deleting === semester._id}
                  >
                    {deleting === semester._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No semesters created yet. Create one to get started.
            </p>
          )}
        </div>
      </CardContent>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => !submitting && setShowDialog(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? 'Edit Semester' : 'Create New Semester'}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? 'Update the semester details'
                : 'Add a new semester for capstone courses'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Semester Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Fall25, Spring26"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g., Fall 2025 Semester"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="rounded"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active Semester
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Semester'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
