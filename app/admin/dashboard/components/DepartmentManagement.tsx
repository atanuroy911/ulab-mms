'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Building2, Edit2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

interface DepartmentHead {
  _id: string;
  name: string;
  email: string;
}

interface Department {
  _id: string;
  code: string;
  name: string;
  shortCode: string;
  icon?: string;
  isActive: boolean;
  headUserId: string | null;
  head: DepartmentHead | null;
}

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/departments');
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepartments(data);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (department: Department) => {
    setEditing(department);
    setName(department.name);
    setShortCode(department.shortCode);
    setIsActive(department.isActive);
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!editing) return;
    if (!name.trim() || !shortCode.trim()) {
      toast.error('Name and short code are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/departments/${editing._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), shortCode: shortCode.trim(), isActive }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update department');
      }

      toast.success('Department updated');
      setShowDialog(false);
      fetchDepartments();
    } catch (error: any) {
      console.error('Error updating department:', error);
      toast.error(error.message || 'Failed to update department');
    } finally {
      setSubmitting(false);
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
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Department Management
        </CardTitle>
        <CardDescription>
          Departments seeded from the course catalogue registry (CSE, BBA, English, MSJ, EEE, Bangla).
          Assign a head here, and use Account Manager to assign coordinator/teacher/admin roles to accounts
          within a department.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {departments.length > 0 ? (
            departments.map((dept) => (
              <div
                key={dept._id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{dept.name}</h4>
                    <Badge variant="outline">{dept.shortCode}</Badge>
                    {!dept.isActive && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5" />
                    {dept.head ? `Head: ${dept.head.name} (${dept.head.email})` : 'No head assigned yet'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleOpenDialog(dept)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">No departments found.</p>
          )}
        </div>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={(open) => !submitting && setShowDialog(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>
              To assign a head, or coordinator/teacher/admin roles, use Account Manager and edit that
              person's account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Name</Label>
              <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dept-short">Short Code</Label>
              <Input id="dept-short" value={shortCode} onChange={(e) => setShortCode(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="dept-active" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              <Label htmlFor="dept-active">Active</Label>
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
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
