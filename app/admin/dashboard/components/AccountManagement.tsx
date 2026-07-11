'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify } from '@/app/utils/notifications';

interface Account {
  _id: string;
  name: string;
  email: string;
  role: string;
  provider: 'google' | 'credentials';
  createdAt: string;
  courseCount: number;
}

interface AccountCourse {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
  section: string;
  courseType: string;
  isArchived: boolean;
  createdAt: string;
  studentCount: number;
}

const SEMESTERS = ['Spring', 'Summer', 'Fall'];

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  const [viewingCourses, setViewingCourses] = useState<AccountCourse[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [editingCourse, setEditingCourse] = useState<AccountCourse | null>(null);
  const [courseForm, setCourseForm] = useState({ name: '', code: '', semester: 'Spring', year: '', section: '' });
  const [courseSaving, setCourseSaving] = useState(false);

  const [deletingCourse, setDeletingCourse] = useState<AccountCourse | null>(null);
  const [courseDeleting, setCourseDeleting] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/accounts');
      const data = await res.json();
      if (res.ok) {
        setAccounts(data.accounts || []);
      } else {
        notify.error(data.error || 'Failed to load accounts');
      }
    } catch (err) {
      console.error('Error loading accounts', err);
      notify.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const openView = async (account: Account) => {
    setViewingAccount(account);
    setViewLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts/${account._id}`);
      const data = await res.json();
      if (res.ok) {
        setViewingCourses(data.courses || []);
      } else {
        notify.error(data.error || 'Failed to load account details');
      }
    } catch (err) {
      console.error('Error loading account details', err);
      notify.error('Failed to load account details');
    } finally {
      setViewLoading(false);
    }
  };

  const refreshViewingCourses = async () => {
    if (!viewingAccount) return;
    const res = await fetch(`/api/admin/accounts/${viewingAccount._id}`);
    const data = await res.json();
    if (res.ok) setViewingCourses(data.courses || []);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setEditName(account.name);
  };

  const saveAccountEdit = async () => {
    if (!editingAccount) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${editingAccount._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        notify.success('Account updated');
        setEditingAccount(null);
        await fetchAccounts();
      } else {
        notify.error(data.error || 'Failed to update account');
      }
    } catch (err) {
      console.error('Error updating account', err);
      notify.error('Failed to update account');
    } finally {
      setEditSaving(false);
    }
  };

  const openDelete = (account: Account) => {
    setDeletingAccount(account);
    setDeleteConfirmText('');
  };

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/accounts/${deletingAccount._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: deleteConfirmText }),
      });
      const data = await res.json();
      if (res.ok) {
        notify.success(`Account deleted (${data.coursesDeleted} course(s) removed)`);
        setDeletingAccount(null);
        if (viewingAccount?._id === deletingAccount._id) setViewingAccount(null);
        await fetchAccounts();
      } else {
        notify.error(data.error || 'Failed to delete account');
      }
    } catch (err) {
      console.error('Error deleting account', err);
      notify.error('Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const openCourseEdit = (course: AccountCourse) => {
    setEditingCourse(course);
    setCourseForm({
      name: course.name,
      code: course.code,
      semester: course.semester,
      year: String(course.year),
      section: course.section,
    });
  };

  const saveCourseEdit = async () => {
    if (!editingCourse || !viewingAccount) return;
    setCourseSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${viewingAccount._id}/courses/${editingCourse._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: courseForm.name.trim(),
          code: courseForm.code.trim(),
          semester: courseForm.semester,
          year: Number(courseForm.year),
          section: courseForm.section.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        notify.success('Course updated');
        setEditingCourse(null);
        await refreshViewingCourses();
      } else {
        notify.error(data.error || 'Failed to update course');
      }
    } catch (err) {
      console.error('Error updating course', err);
      notify.error('Failed to update course');
    } finally {
      setCourseSaving(false);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!deletingCourse || !viewingAccount) return;
    setCourseDeleting(true);
    try {
      const res = await fetch(`/api/admin/accounts/${viewingAccount._id}/courses/${deletingCourse._id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        notify.success('Course deleted');
        setDeletingCourse(null);
        await refreshViewingCourses();
        await fetchAccounts();
      } else {
        notify.error(data.error || 'Failed to delete course');
      }
    } catch (err) {
      console.error('Error deleting course', err);
      notify.error('Failed to delete course');
    } finally {
      setCourseDeleting(false);
    }
  };

  const filteredAccounts = accounts.filter((account) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return account.name.toLowerCase().includes(q) || account.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Account Manager
          </CardTitle>
          <CardDescription>All teacher accounts, the courses they own, and account/course management actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading accounts...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Sign-in</TableHead>
                    <TableHead>Courses</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No accounts found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAccounts.map((account) => (
                      <TableRow key={account._id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="text-muted-foreground">{account.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{account.provider === 'google' ? 'Google' : 'Email/Password'}</Badge>
                        </TableCell>
                        <TableCell>{account.courseCount}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="View courses" onClick={() => openView(account)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Edit account" onClick={() => openEdit(account)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Delete account" onClick={() => openDelete(account)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View account + course manager */}
      <Dialog open={viewingAccount !== null} onOpenChange={(open) => !open && setViewingAccount(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Courses — {viewingAccount?.name}
            </DialogTitle>
            <DialogDescription>{viewingAccount?.email}</DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading courses...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Semester</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingCourses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        This account has no courses.
                      </TableCell>
                    </TableRow>
                  ) : (
                    viewingCourses.map((course) => (
                      <TableRow key={course._id}>
                        <TableCell className="font-medium">{course.name}</TableCell>
                        <TableCell>{course.code}</TableCell>
                        <TableCell>{course.semester} {course.year}</TableCell>
                        <TableCell>{course.section}</TableCell>
                        <TableCell>{course.courseType}</TableCell>
                        <TableCell>{course.studentCount}</TableCell>
                        <TableCell>
                          {course.isArchived ? <Badge variant="secondary">Archived</Badge> : <Badge>Active</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit course" onClick={() => openCourseEdit(course)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Delete course" onClick={() => setDeletingCourse(course)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit account */}
      <Dialog open={editingAccount !== null} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>{editingAccount?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="account-name">Name</Label>
            <Input id="account-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={saveAccountEdit} disabled={editSaving || !editName.trim()}>
              {editSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete account */}
      <Dialog open={deletingAccount !== null} onOpenChange={(open) => !open && setDeletingAccount(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <DialogTitle>Delete Account</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <Alert variant="destructive">
              <AlertDescription>
                This permanently deletes <span className="font-medium text-foreground">{deletingAccount?.name}</span> and every
                course they own, along with all students, exams, marks, attendance, and project/capstone data in those courses.
                This cannot be undone.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm-email">
                Type <span className="font-medium text-foreground">{deletingAccount?.email}</span> to confirm
              </Label>
              <Input
                id="delete-confirm-email"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deletingAccount?.email}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingAccount(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAccount}
              disabled={deleting || deleteConfirmText.trim().toLowerCase() !== deletingAccount?.email.toLowerCase()}
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit course */}
      <Dialog open={editingCourse !== null} onOpenChange={(open) => !open && setEditingCourse(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="course-name">Name</Label>
              <Input id="course-name" value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-code">Code</Label>
              <Input id="course-code" value={courseForm.code} onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={courseForm.semester} onValueChange={(value) => setCourseForm({ ...courseForm, semester: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="course-year">Year</Label>
                <Input
                  id="course-year"
                  type="number"
                  value={courseForm.year}
                  onChange={(e) => setCourseForm({ ...courseForm, year: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-section">Section</Label>
              <Input id="course-section" value={courseForm.section} onChange={(e) => setCourseForm({ ...courseForm, section: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCourse(null)} disabled={courseSaving}>
              Cancel
            </Button>
            <Button onClick={saveCourseEdit} disabled={courseSaving || !courseForm.name.trim() || !courseForm.code.trim()}>
              {courseSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete course */}
      <Dialog open={deletingCourse !== null} onOpenChange={(open) => !open && setDeletingCourse(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <DialogTitle>Delete Course</DialogTitle>
            </div>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertDescription>
              This permanently deletes <span className="font-medium text-foreground">{deletingCourse?.name}</span> ({deletingCourse?.code}) and
              all its students, exams, marks, attendance, and project/capstone data. This cannot be undone.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCourse(null)} disabled={courseDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCourse} disabled={courseDeleting}>
              {courseDeleting ? 'Deleting...' : 'Delete Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
