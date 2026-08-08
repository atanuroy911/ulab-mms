'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit2, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';

// Add inline styles for dropdown color toggling
const dropdownStyles = `
  select option {
    background-color: white;
    color: black;
  }
  select option:checked {
    background-color: #2563eb;
    color: white;
  }
  select {
    color: black;
  }
  select:disabled {
    background-color: #f3f4f6;
    color: #6b7280;
  }
`;

interface Student {
  _id: string;
  name: string;
  studentId: string;
  email: string;
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

interface EvaluatorAssignment {
  evaluatorId: {
    _id: string;
    name: string;
    email: string;
  };
  assignedAt: string;
  status: 'pending' | 'in-progress' | 'completed';
}

interface CapstoneGroup {
  _id: string;
  courseId: Course;
  groupName: string;
  groupNumber?: number;
  description?: string;
  studentIds: Student[];
  supervisorId: User;
  evaluatorAssignments: EvaluatorAssignment[];
  createdAt: string;
  updatedAt: string;
}

interface GroupManagementProps {
  onGroupsUpdated?: () => void;
}

export default function GroupManagement({ onGroupsUpdated }: GroupManagementProps) {
  // State Management
  const [groups, setGroups] = useState<CapstoneGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEvaluatorDialog, setShowEvaluatorDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CapstoneGroup | null>(null);
  const [filterCourse, setFilterCourse] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState('');
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    courseId: '',
    groupName: '',
    supervisorId: '',
    groupSize: 0,
  });

  const [groupStudents, setGroupStudents] = useState<Array<{ name: string; studentId: string }>>([]);

  const [studentForm, setStudentForm] = useState({ studentId: '' });
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [evaluatorForm, setEvaluatorForm] = useState({ evaluatorId: '' });

  // Dropdowns
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [courseStudents, setCourseStudents] = useState<Student[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  // Mark as client-side component
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load groups and dropdowns on mount (client-side only)
  useEffect(() => {
    if (!isClient) return;
    loadGroups();
    loadDropdowns();
  }, [isClient]);

  // Re-load groups when filters change
  useEffect(() => {
    if (!isClient) return;
    loadGroups();
  }, [filterCourse, filterSupervisor, isClient]);

  // Helper to safely get admin password from localStorage
  const getAdminPassword = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem('adminPassword');
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      return null;
    }
  };

  // Refresh dropdowns when dialog opens
  const handleOpenDialog = () => {
    setShowAddDialog(true);
    loadDropdowns(); // Refresh courses list
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      let url = '/api/admin/capstone-group';
      const params = new URLSearchParams();

      if (filterCourse) params.append('courseId', filterCourse);
      if (filterSupervisor) params.append('supervisorId', filterSupervisor);

      if (params.toString()) url += '?' + params.toString();

      const adminPassword = getAdminPassword();

      const response = await fetch(url, {
        headers: adminPassword ? { 'x-admin-password': adminPassword } : {},
      });
      const data = await response.json();

      if (Array.isArray(data)) {
        setGroups(data);
      } else {
        toast.error('Failed to load groups');
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    setLoadingDropdowns(true);
    try {
      // Load ALL admin courses (courses created in Course Management)
      const coursesResponse = await fetch('/api/admin/courses');
      const coursesData = await coursesResponse.json();
      
      if (coursesData.courses && Array.isArray(coursesData.courses)) {
        // Map AdminCourse fields to Course interface
        const mappedCourses = coursesData.courses.map((course: any) => ({
          _id: course._id,
          name: course.courseTitle,
          code: course.courseCode,
        }));
        console.log('Found total courses:', mappedCourses.length);
        setCourses(mappedCourses);
      } else if (Array.isArray(coursesData)) {
        // Handle direct array response
        console.log('Found total courses:', coursesData.length);
        setCourses(coursesData);
      }

      // Load all users (supervisors/evaluators)
      const usersResponse = await fetch('/api/auth/users');
      const usersData = await usersResponse.json();
      console.log('Users response:', usersData);
      if (Array.isArray(usersData)) {
        console.log('Users is array, setting:', usersData.length);
        setUsers(usersData);
      } else if (usersData?.users) {
        console.log('Users in object, setting:', usersData.users.length);
        setUsers(usersData.users);
      } else {
        console.log('No users found in response');
      }
    } catch (error) {
      console.error('Error loading dropdowns:', error);
      toast.error('Failed to load dropdown data');
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const loadStudentsForCourse = async (courseId: string) => {
    try {
      // Load students from the /api/students endpoint by courseId
      const response = await fetch(`/api/students?courseId=${courseId}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setCourseStudents(data);
      } else if (data.students) {
        setCourseStudents(data.students);
      } else {
        setCourseStudents([]);
      }
    } catch (error) {
      console.error('Error loading course students:', error);
      // Don't show error toast here as admin courses may not have associated students
      setCourseStudents([]);
    }
  };

  const handleCourseChange = (courseId: string) => {
    setFormData({ ...formData, courseId });
    if (courseId) {
      loadStudentsForCourse(courseId);
    } else {
      setCourseStudents([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Debug: Log form data
    console.log('Form data:', formData);
    console.log('Group students:', groupStudents);
    console.log('Courses available:', courses.length);
    console.log('Users available:', users.length);

    if (!formData.courseId) {
      toast.error('Please select a course');
      return;
    }
    if (!formData.groupName) {
      toast.error('Please enter a group title');
      return;
    }
    if (!formData.supervisorId) {
      toast.error('Please select a supervisor');
      return;
    }

    // Check if group size is specified and matches students added
    if (!selectedGroup && formData.groupSize > 0) {
      const validStudents = groupStudents.filter(s => s.studentId && s.name);
      if (validStudents.length !== formData.groupSize) {
        toast.error(`Please add all ${formData.groupSize} students with both name and ID`);
        return;
      }
    }

    try {
      // For new groups, try to find student IDs by looking up in courseStudents
      let studentIds: string[] = [];
      
      if (!selectedGroup && groupStudents.length > 0) {
        for (const student of groupStudents) {
          if (student.studentId) {
            // Try to find this student in courseStudents by studentId
            const found = courseStudents.find(cs => cs.studentId === student.studentId);
            if (found) {
              studentIds.push(found._id);
            } else {
              // Try to look up via API
              try {
                const response = await fetch(`/api/students?studentId=${student.studentId}`);
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                  studentIds.push(data[0]._id);
                } else {
                  toast.warning(`Could not find student with ID ${student.studentId}`);
                }
              } catch (error) {
                console.error('Error looking up student:', error);
              }
            }
          }
        }
      }

      const payload = {
        courseId: formData.courseId,
        groupName: formData.groupName,
        studentIds: studentIds,
        supervisorId: formData.supervisorId,
      };

      console.log('Submitting payload:', payload);

      const url = selectedGroup
        ? `/api/admin/capstone-group/${selectedGroup._id}`
        : '/api/admin/capstone-group';

      const method = selectedGroup ? 'PUT' : 'POST';

      // Get admin password from localStorage
      const adminPassword = getAdminPassword();

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(adminPassword && { 'x-admin-password': adminPassword }),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(selectedGroup ? 'Group updated successfully' : 'Group created successfully');
        setShowAddDialog(false);
        resetForm();
        loadGroups();
        onGroupsUpdated?.();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save group');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save group');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Are you sure you want to delete this group?')) {
      return;
    }

    try {
      const adminPassword = getAdminPassword();

      const response = await fetch(`/api/admin/capstone-group/${id}`, {
        method: 'DELETE',
        headers: adminPassword ? { 'x-admin-password': adminPassword } : {},
      });

      if (response.ok) {
        toast.success('Group deleted successfully');
        loadGroups();
      } else {
        toast.error('Failed to delete group');
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

  const handleAddStudentToGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedGroup || !studentForm.studentId) {
      toast.error('Please select a student');
      return;
    }

    // Check if student is already in the group
    if (selectedGroup.studentIds.some(s => s._id === studentForm.studentId)) {
      toast.error('This student is already in the group');
      return;
    }

    try {
      const adminPassword = getAdminPassword();

      const response = await fetch(`/api/admin/capstone-group/${selectedGroup._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(adminPassword && { 'x-admin-password': adminPassword }),
        },
        body: JSON.stringify({
          studentIds: [...selectedGroup.studentIds.map(s => s._id), studentForm.studentId],
        }),
      });

      if (response.ok) {
        const updatedGroup = await response.json();
        setSelectedGroup(updatedGroup);
        setGroups((prev) =>
          prev.map((g) => (g._id === updatedGroup._id ? updatedGroup : g))
        );
        setStudentForm({ studentId: '' });
        toast.success('Student added to group successfully');
        setShowAddStudentDialog(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add student');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to add student');
    }
  };

  const handleEditGroup = (group: CapstoneGroup) => {
    setSelectedGroup(group);
    setFormData({
      courseId: group.courseId._id,
      groupName: group.groupName,
      supervisorId: group.supervisorId._id,
      groupSize: group.studentIds.length,
    });
    setGroupStudents(
      group.studentIds.map(student => ({
        name: student.name,
        studentId: student.studentId,
      }))
    );
    loadStudentsForCourse(group.courseId._id);
    loadDropdowns(); // Refresh dropdowns when editing
    setShowAddDialog(true);
  };

  const handleAssignEvaluator = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedGroup || !evaluatorForm.evaluatorId) {
      toast.error('Please select an evaluator');
      return;
    }

    try {
      const adminPassword = getAdminPassword();

      const response = await fetch(`/api/admin/capstone-group/${selectedGroup._id}/assign-evaluator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminPassword && { 'x-admin-password': adminPassword }),
        },
        body: JSON.stringify({ evaluatorId: evaluatorForm.evaluatorId }),
      });

      if (response.ok) {
        const updatedGroup = await response.json();
        setSelectedGroup(updatedGroup);
        setGroups((prev) => prev.map((g) => (g._id === updatedGroup._id ? updatedGroup : g)));
        setEvaluatorForm({ evaluatorId: '' });
        toast.success('Evaluator assigned successfully');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to assign evaluator');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign evaluator');
    }
  };

  const handleRemoveEvaluator = async (evaluatorId: string) => {
    if (!selectedGroup) return;

    try {
      const response = await fetch(
        `/api/admin/capstone-group/${selectedGroup._id}/assign-evaluator/${evaluatorId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        const updatedGroup = await response.json();
        setSelectedGroup(updatedGroup);
        setGroups((prev) => prev.map((g) => (g._id === updatedGroup._id ? updatedGroup : g)));
        toast.success('Evaluator removed successfully');
      } else {
        toast.error('Failed to remove evaluator');
      }
    } catch (error) {
      console.error('Error removing evaluator:', error);
      toast.error('Failed to remove evaluator');
    }
  };

  const resetForm = () => {
    setFormData({
      courseId: '',
      groupName: '',
      supervisorId: '',
      groupSize: 0,
    });
    setGroupStudents([]);
    setSelectedStudent(null);
    setSelectedGroup(null);
    setCourseStudents([]);
    setStudentForm({ studentId: '' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <style>{dropdownStyles}</style>
      {/* Header and Filters */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Capstone Groups</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={loadDropdowns}
            disabled={loadingDropdowns}
          >
            Refresh
          </Button>
          <Button onClick={() => { resetForm(); handleOpenDialog(); }}>
            <Plus className="w-4 h-4 mr-2" />
            Create Group
          </Button>
        </div>
      </div>

      {/* Filter Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Filter by Course</Label>
              <select
                value={filterCourse}
                onChange={(e) => setFilterCourse(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">All Courses</option>
                {courses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.code || ''} - {course.name || 'Unknown Course'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Filter by Supervisor</Label>
              <select
                value={filterSupervisor}
                onChange={(e) => setFilterSupervisor(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">All Supervisors</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : groups.length === 0 ? (
        <Alert>
          <AlertDescription>No groups found. Create one to get started.</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group._id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{group.groupName}</CardTitle>
                      {group.groupNumber && (
                        <Badge variant="outline">Group {group.groupNumber}</Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      Course: {group.courseId.name} ({group.courseId.code})
                    </CardDescription>
                    {group.description && (
                      <p className="text-sm text-gray-600 mt-2">{group.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditGroup(group)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteGroup(group._id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Supervisor */}
                <div>
                  <p className="text-sm font-semibold text-gray-700">Supervisor</p>
                  <p className="text-sm text-gray-600">
                    {group.supervisorId.name} ({group.supervisorId.email})
                  </p>
                </div>

                {/* Students */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <p className="text-sm font-semibold text-gray-700">
                        Students ({group.studentIds.length})
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { 
                        setSelectedGroup(group); 
                        loadStudentsForCourse(group.courseId._id);
                        setShowAddStudentDialog(true); 
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Student
                    </Button>
                  </div>
                  {group.studentIds.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No students in this group yet</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.studentIds.map((student) => (
                        <div key={student._id} className="text-sm p-2 bg-gray-50 rounded">
                          <p className="font-medium">{student.name}</p>
                          <p className="text-gray-600">{student.studentId}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Evaluators */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">
                      Assigned Evaluators ({group.evaluatorAssignments.length})
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedGroup(group); setShowEvaluatorDialog(true); }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Assign Evaluator
                    </Button>
                  </div>
                  {group.evaluatorAssignments.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No evaluators assigned yet</p>
                  ) : (
                    <div className="space-y-2">
                      {group.evaluatorAssignments.map((assignment, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{assignment.evaluatorId.name}</p>
                            <p className="text-xs text-gray-600">{assignment.evaluatorId.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(assignment.status)}>
                              {assignment.status}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveEvaluator(assignment.evaluatorId._id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-500 pt-2 border-t">
                  Created: {new Date(group.createdAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Group Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedGroup ? 'Edit Group' : 'Create New Group'}</DialogTitle>
            <DialogDescription>
              {selectedGroup
                ? 'Update the group information'
                : 'Create a new capstone group with students'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <Label htmlFor="groupName" className="text-sm font-medium">
                Title *
              </Label>
              <Input
                id="groupName"
                value={formData.groupName}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                placeholder="e.g., AI-Based Recommendation System"
                required
              />
            </div>

            {/* Course Selection */}
            <div>
              <Label htmlFor="courseId" className="text-sm font-medium">
                Course * ({courses.length} available)
              </Label>
              {courses.length === 0 && (
                <Alert className="mb-2">
                  <AlertDescription className="text-red-600">
                    No capstone courses found. Creating them automatically...
                  </AlertDescription>
                </Alert>
              )}
              <select
                id="courseId"
                value={formData.courseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-black"
                disabled={loadingDropdowns || selectedGroup !== null || courses.length === 0}
                required
              >
                <option value="">Select a course</option>
                {courses.filter(course => course && course._id).map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.code || ''} - {course.name || 'Unknown Course'}
                  </option>
                ))}
              </select>
            </div>

            {/* Supervisor Email */}
            <div>
              <Label htmlFor="supervisorId" className="text-sm font-medium">
                Supervisor Email * ({users.length} available)
              </Label>
              {users.length === 0 && (
                <Alert className="mb-2">
                  <AlertDescription className="text-red-600">
                    No supervisors/users found in the system.
                  </AlertDescription>
                </Alert>
              )}
              <select
                id="supervisorId"
                value={formData.supervisorId}
                onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-black"
                disabled={users.length === 0}
                required
              >
                <option value="">Select a supervisor</option>
                {users.filter(user => user && user._id).map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.email || 'N/A'} - {user.name || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            {/* Group Size */}
            {!selectedGroup && (
              <div>
                <Label htmlFor="groupSize" className="text-sm font-medium">
                  Number of Students in Group
                </Label>
                <Input
                  id="groupSize"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.groupSize || ''}
                  onChange={(e) => {
                    const size = parseInt(e.target.value) || 0;
                    setFormData({ ...formData, groupSize: size });
                    // Initialize groupStudents array
                    if (size > 0) {
                      const newStudents = Array(size).fill(null).map((_, i) => 
                        groupStudents[i] || { name: '', studentId: '' }
                      );
                      setGroupStudents(newStudents);
                    } else {
                      setGroupStudents([]);
                    }
                  }}
                  placeholder="Enter number of students"
                  className="text-black"
                />
              </div>
            )}

            {/* Student Input Fields */}
            {!selectedGroup && formData.groupSize > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">Add Student Details ({groupStudents.filter(s => s.studentId && s.name).length}/{formData.groupSize})</h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {groupStudents.map((student, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Student Name</Label>
                        <Input
                          type="text"
                          placeholder="e.g., Ahmed Ali"
                          value={student.name}
                          onChange={(e) => {
                            const newStudents = [...groupStudents];
                            newStudents[index].name = e.target.value;
                            setGroupStudents(newStudents);
                          }}
                          className="text-black text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Student ID</Label>
                        <Input
                          type="text"
                          placeholder="e.g., 21-0001"
                          value={student.studentId}
                          onChange={(e) => {
                            const newStudents = [...groupStudents];
                            newStudents[index].studentId = e.target.value;
                            setGroupStudents(newStudents);
                          }}
                          className="text-black text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowAddDialog(false); resetForm(); }}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={loadingDropdowns || courses.length === 0 || users.length === 0}
              >
                {selectedGroup ? 'Update Group' : 'Create Group'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Evaluator Dialog */}
      <Dialog open={showEvaluatorDialog} onOpenChange={setShowEvaluatorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Evaluator</DialogTitle>
            <DialogDescription>
              Assign an evaluator to {selectedGroup?.groupName}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignEvaluator} className="space-y-4">
            <div>
              <Label htmlFor="evaluatorId" className="text-sm font-medium">
                Select Evaluator *
              </Label>
              <select
                id="evaluatorId"
                value={evaluatorForm.evaluatorId}
                onChange={(e) => setEvaluatorForm({ evaluatorId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                <option value="">Choose an evaluator</option>
                {users
                  .filter(
                    (user) =>
                      // Exclude already assigned evaluators
                      !selectedGroup?.evaluatorAssignments.some(
                        (ea) => ea.evaluatorId._id === user._id
                      ) &&
                      // Exclude the supervisor from being assigned as evaluator
                      selectedGroup?.supervisorId._id !== user._id
                  )
                  .map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
              </select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowEvaluatorDialog(false); setEvaluatorForm({ evaluatorId: '' }); }}
              >
                Cancel
              </Button>
              <Button type="submit">Assign Evaluator</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Student to Group</DialogTitle>
            <DialogDescription>
              Add a student to {selectedGroup?.groupName}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddStudentToGroup} className="space-y-4">
            <div>
              <Label htmlFor="addStudentId" className="text-sm font-medium">
                Select Student *
              </Label>
              <select
                id="addStudentId"
                value={studentForm.studentId}
                onChange={(e) => setStudentForm({ studentId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                <option value="">Choose a student</option>
                {courseStudents
                  .filter(
                    (student) =>
                      // Exclude students already in the group
                      !selectedGroup?.studentIds.some(
                        (s) => s._id === student._id
                      )
                  )
                  .map((student) => (
                    <option key={student._id} value={student._id}>
                      {student.name} ({student.studentId})
                    </option>
                  ))}
              </select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowAddStudentDialog(false); setStudentForm({ studentId: '' }); }}
              >
                Cancel
              </Button>
              <Button type="submit">Add Student</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

