'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CapstoneAssignment {
  _id: string;
  studentId: {
    _id: string;
    name: string;
    studentId: string;
  };
  courseId: {
    _id: string;
    name: string;
    code: string;
  };
  supervisorId: {
    _id: string;
    name: string;
    email: string;
  };
  evaluatorId?: {
    _id: string;
    name: string;
    email: string;
  };
  supervisorRole: 'supervisor' | 'evaluator' | 'both';
  evaluatorRole: 'supervisor' | 'evaluator' | 'both';
  createdAt: string;
  updatedAt: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
}

interface Course {
  _id: string;
  name: string;
  code: string;
}

interface Student {
  _id: string;
  name: string;
  studentId: string;
}

const CAPSTONE_COURSES = ['CSE4098A', 'CSE4098B', 'CSE4098C', 'CSE499'];

export default function CapstoneAssignmentManagement() {
  const [assignments, setAssignments] = useState<CapstoneAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<CapstoneAssignment | null>(null);
  const [filterCourse, setFilterCourse] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');

  // Form states
  const [formData, setFormData] = useState({
    courseId: '',
    studentId: '',
    supervisorId: '',
    evaluatorId: '',
    supervisorRole: 'supervisor' as 'supervisor' | 'evaluator' | 'both',
    evaluatorRole: 'evaluator' as 'supervisor' | 'evaluator' | 'both',
  });

  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
    loadDropdowns();
  }, [filterCourse, filterUser]);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      let url = '/api/admin/capstone-assignment';
      const params = new URLSearchParams();

      if (filterCourse) params.append('courseId', filterCourse);
      if (filterUser) params.append('userId', filterUser);

      if (params.toString()) url += '?' + params.toString();

      const response = await fetch(url);
      const data = await response.json();

      if (Array.isArray(data)) {
        setAssignments(data);
      } else {
        toast.error('Failed to load assignments');
      }
    } catch (err: any) {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    setLoadingDropdowns(true);
    try {
      // Load courses
      const coursesResponse = await fetch('/api/courses');
      const coursesData = await coursesResponse.json();
      if (coursesData.courses) {
        const capstoneCoursesFiltered = coursesData.courses.filter((c: any) =>
          CAPSTONE_COURSES.some(code => c.code?.toUpperCase().includes(code))
        );
        setCourses(capstoneCoursesFiltered);
      }

      // Load users
      const usersResponse = await fetch('/api/students');
      const usersData = await usersResponse.json();
      if (Array.isArray(usersData)) {
        setUsers(usersData);
      }
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const loadStudents = async (courseId: string) => {
    try {
      const response = await fetch(`/api/courses/${courseId}`);
      const data = await response.json();
      if (data.students) {
        setStudents(data.students);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    }
  };

  const handleCourseChange = (courseId: string) => {
    setFormData({ ...formData, courseId });
    if (courseId) {
      loadStudents(courseId);
    } else {
      setStudents([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.courseId || !formData.studentId || !formData.supervisorId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/capstone-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(selectedAssignment ? 'Assignment updated successfully' : 'Assignment created successfully');
        setShowAddDialog(false);
        setSelectedAssignment(null);
        setFormData({
          courseId: '',
          studentId: '',
          supervisorId: '',
          evaluatorId: '',
          supervisorRole: 'supervisor',
          evaluatorRole: 'evaluator',
        });
        loadAssignments();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save assignment');
      }
    } catch (err: any) {
      toast.error('Failed to save assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this assignment?')) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/capstone-assignment?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Assignment removed successfully');
        loadAssignments();
      } else {
        toast.error('Failed to remove assignment');
      }
    } catch (err: any) {
      toast.error('Failed to remove assignment');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (assignment: CapstoneAssignment) => {
    setSelectedAssignment(assignment);
    setFormData({
      courseId: assignment.courseId._id,
      studentId: assignment.studentId._id,
      supervisorId: assignment.supervisorId._id,
      evaluatorId: assignment.evaluatorId?._id || '',
      supervisorRole: assignment.supervisorRole as 'supervisor' | 'evaluator' | 'both',
      evaluatorRole: assignment.evaluatorRole as 'supervisor' | 'evaluator' | 'both',
    });
    loadStudents(assignment.courseId._id);
    setShowAddDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setSelectedAssignment(null);
    setFormData({
      courseId: '',
      studentId: '',
      supervisorId: '',
      evaluatorId: '',
      supervisorRole: 'supervisor',
      evaluatorRole: 'evaluator',
    });
    setStudents([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Capstone Assignment Management</h2>
        <div className="flex gap-2">
          <Button onClick={loadAssignments} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Assign Student
          </Button>
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <AlertDescription>
          Assign students to supervisors and evaluators for capstone courses (CSE4098A, CSE4098B, CSE4098C, CSE499).
          Students will see their assignments in their Capstone tab.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="filter-course">Filter by Course:</Label>
          <select
            id="filter-course"
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="filter-user">Filter by User:</Label>
          <select
            id="filter-user"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assignments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assigned Students</CardTitle>
          <CardDescription>
            Manage capstone student assignments to supervisors and evaluators
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No assignments found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Course</th>
                    <th className="text-left py-3 px-4 font-semibold">Student Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Student ID</th>
                    <th className="text-left py-3 px-4 font-semibold">Supervisor</th>
                    <th className="text-left py-3 px-4 font-semibold">Supervisor Role</th>
                    <th className="text-left py-3 px-4 font-semibold">Evaluator</th>
                    <th className="text-left py-3 px-4 font-semibold">Evaluator Role</th>
                    <th className="text-right py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment._id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{assignment.courseId.code}</td>
                      <td className="py-3 px-4">{assignment.studentId.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{assignment.studentId.studentId}</td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          <div className="font-medium">{assignment.supervisorId.name}</div>
                          <div className="text-xs text-muted-foreground">{assignment.supervisorId.email}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                          {assignment.supervisorRole}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {assignment.evaluatorId ? (
                          <div className="text-sm">
                            <div className="font-medium">{assignment.evaluatorId.name}</div>
                            <div className="text-xs text-muted-foreground">{assignment.evaluatorId.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not assigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {assignment.evaluatorId ? (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                            {assignment.evaluatorRole}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(assignment)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deletingId === assignment._id}
                            onClick={() => handleDelete(assignment._id)}
                          >
                            {deletingId === assignment._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Statistics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Assignments:</span>
            <span className="font-medium">{assignments.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">With Evaluator:</span>
            <span className="font-medium">{assignments.filter(a => a.evaluatorId).length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Without Evaluator:</span>
            <span className="font-medium">{assignments.filter(a => !a.evaluatorId).length}</span>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        if (!open && !isSubmitting) handleCloseDialog();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedAssignment ? 'Edit Assignment' : 'Assign Student to Supervisor/Evaluator'}
            </DialogTitle>
            <DialogDescription>
              {selectedAssignment
                ? 'Update the assignment details'
                : 'Select a capstone course, student, and supervisor/evaluator'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Course Selection */}
            <div>
              <Label htmlFor="courseId" className="font-semibold">
                Course <span className="text-red-500">*</span>
              </Label>
              <select
                id="courseId"
                value={formData.courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                disabled={loadingDropdowns}
                className="w-full px-3 py-2 border rounded-md mt-1"
                required
              >
                <option value="">Select a capstone course</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Student Selection */}
            <div>
              <Label htmlFor="studentId" className="font-semibold">
                Student <span className="text-red-500">*</span>
              </Label>
              <select
                id="studentId"
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                disabled={!formData.courseId || students.length === 0}
                className="w-full px-3 py-2 border rounded-md mt-1"
                required
                title={!formData.courseId ? 'Select a course first' : students.length === 0 ? 'No students found in this course' : undefined}
              >
                <option value="">
                  {students.length === 0 ? 'Select a course first' : 'Select a student'}
                </option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.studentId})
                  </option>
                ))}
              </select>
            </div>

            {/* Supervisor Selection */}
            <div>
              <Label htmlFor="supervisorId" className="font-semibold">
                Supervisor <span className="text-red-500">*</span>
              </Label>
              <select
                id="supervisorId"
                value={formData.supervisorId}
                onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
                disabled={loadingDropdowns}
                className="w-full px-3 py-2 border rounded-md mt-1"
                required
              >
                <option value="">Select a supervisor</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Supervisor Role */}
            <div>
              <Label htmlFor="supervisorRole" className="font-semibold">
                Supervisor Role
              </Label>
              <select
                id="supervisorRole"
                value={formData.supervisorRole}
                onChange={(e) => setFormData({ ...formData, supervisorRole: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-md mt-1"
              >
                <option value="supervisor">Supervisor</option>
                <option value="evaluator">Evaluator</option>
                <option value="both">Both (Supervisor & Evaluator)</option>
              </select>
            </div>

            {/* Evaluator Selection */}
            <div>
              <Label htmlFor="evaluatorId" className="font-semibold">
                Evaluator (Optional)
              </Label>
              <select
                id="evaluatorId"
                value={formData.evaluatorId}
                onChange={(e) => setFormData({ ...formData, evaluatorId: e.target.value })}
                disabled={loadingDropdowns}
                className="w-full px-3 py-2 border rounded-md mt-1"
              >
                <option value="">No evaluator</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Evaluator Role */}
            {formData.evaluatorId && (
              <div>
                <Label htmlFor="evaluatorRole" className="font-semibold">
                  Evaluator Role
                </Label>
                <select
                  id="evaluatorRole"
                  value={formData.evaluatorRole}
                  onChange={(e) => setFormData({ ...formData, evaluatorRole: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-md mt-1"
                >
                  <option value="evaluator">Evaluator</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="both">Both (Supervisor & Evaluator)</option>
                </select>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={handleCloseDialog}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {selectedAssignment ? 'Updating...' : 'Assigning...'}
                  </>
                ) : (
                  selectedAssignment ? 'Update Assignment' : 'Assign Student'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
