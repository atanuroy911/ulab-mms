'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Course {
  _id: string;
  name: string;
  code: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
}

interface Student {
  _id: string;
  name: string;
  studentId: string;
}

interface Semester {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
}

interface CapstoneGroup {
  _id: string;
  groupName: string;
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
  semester?: string;
  studentIds: Array<{
    _id: string;
    name: string;
    studentId: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  title: string;
  courseId: string;
  supervisorId: string;
  semester: string;
  numberOfMembers: number;
  students: Array<{ name: string; id: string }>;
}

export default function CapstoneManagement() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [supervisors, setSupervisors] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [capstoneGroups, setCapstoneGroups] = useState<CapstoneGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<CapstoneGroup | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groupSearchQuery, setGroupSearchQuery] = useState<string>('');
  const [studentSearchOpen, setStudentSearchOpen] = useState<boolean[]>([false, false, false]);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string[]>(['', '', '']);
  const [supervisorSearchOpen, setSupervisorSearchOpen] = useState(false);
  const [supervisorSearchQuery, setSupervisorSearchQuery] = useState<string>('');

  const [marksFiles, setMarksFiles] = useState<any[]>([]);
  const [loadingMarksFiles, setLoadingMarksFiles] = useState(false);
  const [peerMarksFiles, setPeerMarksFiles] = useState<any[]>([]);
  const [loadingPeerMarksFiles, setLoadingPeerMarksFiles] = useState(false);
  const [posterMarksFiles, setPosterMarksFiles] = useState<any[]>([]);
  const [loadingPosterMarksFiles, setLoadingPosterMarksFiles] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    courseId: '',
    supervisorId: '',
    semester: '',
    numberOfMembers: 3,
    students: Array(3).fill({ name: '', id: '' }),
  });

  // Load initial data
  useEffect(() => {
    loadInitialData();
    loadMarksFiles();
    loadPeerMarksFiles();
    loadPosterMarksFiles();
  }, []);

  const loadInitialData = async () => {
    setLoadingData(true);
    try {
      // Load courses
      const coursesRes = await fetch('/api/admin/courses-list');
      const coursesData = await coursesRes.json();
      if (coursesData.courses && Array.isArray(coursesData.courses)) {
        setCourses(coursesData.courses);
        console.log('Courses loaded:', coursesData.courses.length);
      } else {
        console.warn('No courses found or invalid format:', coursesData);
      }

      // Load supervisors (users)
      const usersRes = await fetch('/api/auth/users');
      const usersData = await usersRes.json();
      if (Array.isArray(usersData)) {
        setSupervisors(usersData);
        console.log('Supervisors loaded:', usersData.length);
      } else {
        console.warn('No supervisors found or invalid format:', usersData);
      }

      // Load all students
      const studentsRes = await fetch('/api/admin/students-list');
      const studentsData = await studentsRes.json();
      if (Array.isArray(studentsData)) {
        setStudents(studentsData);
        console.log('Students loaded:', studentsData.length);
      } else {
        console.warn('No students found or invalid format:', studentsData);
      }

      // Load capstone groups
      await loadCapstoneGroups();

      // Load semesters
      const semestersRes = await fetch('/api/admin/semesters');
      const semestersData = await semestersRes.json();
      if (Array.isArray(semestersData)) {
        setSemesters(semestersData);
        console.log('Semesters loaded:', semestersData.length);
      } else {
        console.warn('No semesters found or invalid format:', semestersData);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const loadCapstoneGroups = async () => {
    try {
      const response = await fetch('/api/admin/capstone-group');
      const data = await response.json();
      if (Array.isArray(data)) {
        setCapstoneGroups(data);
      }
    } catch (err) {
      console.error('Failed to load capstone groups:', err);
    }
  };

  const getSemesterLabel = (semesterValue?: string) => {
    if (!semesterValue) return 'N/A';

    const semester = semesters.find(
      (item) => item._id === semesterValue || item.name === semesterValue
    );

    if (!semester) return semesterValue;

    return semester.description
      ? `${semester.name} - ${semester.description}`
      : semester.name;
  };

  const getSemesterSelectValue = (semesterValue?: string) => {
    if (!semesterValue) return '';

    const semester = semesters.find(
      (item) => item._id === semesterValue || item.name === semesterValue
    );

    return semester?._id || semesterValue;
  };

  const handleNumberOfMembersChange = (num: number) => {
    if (num < 3 || num > 6) return;
    
    const newStudents = Array(num).fill({ name: '', id: '' });
    // Preserve existing student data if downscaling
    for (let i = 0; i < Math.min(num, formData.students.length); i++) {
      newStudents[i] = formData.students[i];
    }
    
    // Adjust studentSearchOpen array size
    const newSearchOpen = Array(num).fill(false);
    for (let i = 0; i < Math.min(num, studentSearchOpen.length); i++) {
      newSearchOpen[i] = studentSearchOpen[i];
    }
    setStudentSearchOpen(newSearchOpen);

    // Adjust studentSearchQuery array size
    const newSearchQuery = Array(num).fill('');
    for (let i = 0; i < Math.min(num, studentSearchQuery.length); i++) {
      newSearchQuery[i] = studentSearchQuery[i];
    }
    setStudentSearchQuery(newSearchQuery);
    
    setFormData({
      ...formData,
      numberOfMembers: num,
      students: newStudents,
    });
  };

  const handleStudentChange = (index: number, field: 'name' | 'id', value: string) => {
    const newStudents = [...formData.students];
    newStudents[index] = {
      ...newStudents[index],
      [field]: value,
    };
    
    // If name is changed, auto-fill the student ID
    if (field === 'name' && value) {
      const selectedStudent = students.find((s) => s._id === value);
      if (selectedStudent) {
        newStudents[index].id = selectedStudent.studentId;
      }
    }
    
    setFormData({
      ...formData,
      students: newStudents,
    });
  };

  const handleStudentSearchOpen = (index: number, open: boolean) => {
    const newSearchOpen = [...studentSearchOpen];
    newSearchOpen[index] = open;
    setStudentSearchOpen(newSearchOpen);
    if (!open) {
      const newSearchQuery = [...studentSearchQuery];
      newSearchQuery[index] = '';
      setStudentSearchQuery(newSearchQuery);
    }
  };

  const handleStudentSearch = (index: number, query: string) => {
    const newSearchQuery = [...studentSearchQuery];
    newSearchQuery[index] = query.toLowerCase();
    setStudentSearchQuery(newSearchQuery);
  };

  const getFilteredStudents = (index: number) => {
    const query = studentSearchQuery[index];
    if (!query) return students;
    return students.filter((s) =>
      s.name.toLowerCase().includes(query) || s.studentId.toLowerCase().includes(query)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.title.trim()) {
      toast.error('Please enter a group title');
      return;
    }
    if (!formData.courseId) {
      toast.error('Please select a course');
      return;
    }
    if (!formData.supervisorId) {
      toast.error('Please select a supervisor');
      return;
    }
    if (!formData.semester.trim()) {
      toast.error('Please enter a semester');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/capstone-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': localStorage.getItem('adminPassword') || '',
        },
        body: JSON.stringify({
          groupName: formData.title,
          courseId: formData.courseId,
          supervisorId: formData.supervisorId,
          semester: formData.semester,
          studentIds: formData.students.map(s => s.name), // Send actual student _ids
        }),
      });

      if (response.ok) {
        toast.success('Capstone group created successfully');
        setShowCreateDialog(false);
        setStudentSearchOpen([false, false, false]);
        setStudentSearchQuery(['', '', '']);
        setFormData({
          title: '',
          courseId: '',
          supervisorId: '',
          semester: '',
          numberOfMembers: 3,
          students: Array(3).fill({ name: '', id: '' }),
        });
        // Reload groups list
        await loadCapstoneGroups();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create group');
      }
    } catch (err) {
      console.error('Error creating group:', err);
      toast.error('Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setShowCreateDialog(false);
    setStudentSearchOpen([false, false, false]);
    setStudentSearchQuery(['', '', '']);
    setSupervisorSearchOpen(false);
    setSupervisorSearchQuery('');
    setFormData({
      title: '',
      courseId: '',
      supervisorId: '',
      semester: '',
      numberOfMembers: 3,
      students: Array(3).fill({ name: '', id: '' }),
    });
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/capstone-group/${selectedGroup._id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': localStorage.getItem('adminPassword') || '',
        },
      });

      if (response.ok) {
        toast.success('Capstone group deleted successfully');
        setShowDetailsDialog(false);
        setShowDeleteConfirm(false);
        setSelectedGroup(null);
        await loadCapstoneGroups();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete group');
      }
    } catch (err) {
      console.error('Error deleting group:', err);
      toast.error('Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditClick = () => {
    if (!selectedGroup) return;
    
    setFormData({
      title: selectedGroup.groupName,
      courseId: selectedGroup.courseId._id,
      supervisorId: selectedGroup.supervisorId._id,
      semester: getSemesterSelectValue((selectedGroup as any).semester),
      numberOfMembers: formData.numberOfMembers,
      students: formData.students,
    });
    setIsEditMode(true);
    setShowDetailsDialog(false);
    setShowEditDialog(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation for edit mode
    if (!formData.courseId) {
      toast.error('Please select a course');
      return;
    }
    if (!formData.semester.trim()) {
      toast.error('Please enter a semester');
      return;
    }

    if (!selectedGroup) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/admin/capstone-group/${selectedGroup._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': localStorage.getItem('adminPassword') || '',
        },
        body: JSON.stringify({
          courseId: formData.courseId,
          semester: formData.semester,
        }),
      });

      if (response.ok) {
        toast.success('Capstone group updated successfully');
        setShowEditDialog(false);
        setIsEditMode(false);
        handleCloseEditDialog();
        await loadCapstoneGroups();
        // Reload the selected group if details dialog was showing
        const updatedGroup = await fetch(
          `/api/admin/capstone-group/${selectedGroup._id}`,
          {
            headers: {
              'x-admin-password': localStorage.getItem('adminPassword') || '',
            },
          }
        ).then(res => res.json());
        setSelectedGroup(updatedGroup);
        setShowDetailsDialog(true);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update group');
      }
    } catch (err) {
      console.error('Error updating group:', err);
      toast.error('Failed to update group');
    } finally {
      setUpdating(false);
    }
  };

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setIsEditMode(false);
    setStudentSearchOpen([false, false, false]);
    setStudentSearchQuery(['', '', '']);
    setSupervisorSearchOpen(false);
    setSupervisorSearchQuery('');
    setFormData({
      title: '',
      courseId: '',
      supervisorId: '',
      semester: '',
      numberOfMembers: 3,
      students: Array(3).fill({ name: '', id: '' }),
    });
  };

  if (loadingData) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getFilteredGroups = () => {
    if (!groupSearchQuery.trim()) {
      return capstoneGroups;
    }
    
    const query = groupSearchQuery.toLowerCase();
    return capstoneGroups.filter(
      (group) =>
        group.groupName.toLowerCase().includes(query) ||
        group.courseId?.code?.toLowerCase().includes(query) ||
        group.supervisorId?.name?.toLowerCase().includes(query) ||
        group.supervisorId?.email?.toLowerCase().includes(query)
    );
  };

  const handleGroupSelect = (groupId: string) => {
    const group = capstoneGroups.find((g) => g._id === groupId);
    if (group) {
      setSelectedGroup(group);
      setShowDetailsDialog(true);
    }
    setSelectedGroupId('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Capstone Management</h2>
      </div>

      {/* Create Groups Card */}
      <Card>
        <CardHeader>
          <CardTitle>Create Capstone Groups</CardTitle>
          <CardDescription>
            Create a new capstone group with students and a supervisor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setShowCreateDialog(true)} size="lg" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Create Capstone Groups
          </Button>
        </CardContent>
      </Card>

      {/* View Groups Card */}
      <Card>
        <CardHeader>
          <CardTitle>View Capstone Groups</CardTitle>
          <CardDescription>
            Search and select a group to view its details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {capstoneGroups.length === 0 ? (
            <p className="text-muted-foreground">No capstone groups created yet</p>
          ) : (
            <>
              <Input
                placeholder="Search by group name, course code, or supervisor..."
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="w-full"
              />
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {getFilteredGroups().length > 0 ? (
                  getFilteredGroups().map((group) => (
                    <div
                      key={group._id}
                      onClick={() => handleGroupSelect(group._id)}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">{group.groupName}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.courseId?.code} • Supervisor: {group.supervisorId?.name}
                          </p>
                        </div>
                        <p className="text-xs bg-muted px-2 py-1 rounded">
                          {group.studentIds?.length || 0} members
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No groups match your search
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Group Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open && !loading) handleCloseDialog();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Capstone Group</DialogTitle>
            <DialogDescription>
              Fill in the group details and select students
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Field */}
            <div>
              <Label htmlFor="title" className="font-semibold">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="Enter group title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="mt-1"
              />
            </div>

            {/* Course Selection - Limited to Specific Courses */}
            <div>
              <Label htmlFor="courseId" className="font-semibold">
                Course <span className="text-red-500">*</span>
              </Label>
              <select
                id="courseId"
                value={formData.courseId}
                onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md mt-1 bg-background text-foreground dark:bg-slate-950 dark:border-slate-700 dark:text-white"
                required
              >
                <option value="">Select a course</option>
                {courses
                  .filter((course) => ['CSE4098A', 'CSE4098B', 'CSE4098C', 'CSE499'].includes(course.code))
                  .map((course) => (
                    <option key={course._id} value={course._id}>
                      {course.code} - {course.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Supervisor Selection - Searchable */}
            <div>
              <Label htmlFor="supervisorId" className="font-semibold">
                Supervisor <span className="text-red-500">*</span>
              </Label>
              <Popover open={supervisorSearchOpen} onOpenChange={setSupervisorSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between mt-1"
                  >
                    {supervisors.find((s) => s._id === formData.supervisorId)?.name || 'Select supervisor...'}
                    <span className="text-muted-foreground">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <div className="p-2 space-y-2">
                    <Input
                      placeholder="Search supervisors..."
                      value={supervisorSearchQuery}
                      onChange={(e) => setSupervisorSearchQuery(e.target.value)}
                      className="h-8"
                    />
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {supervisors
                        .filter((supervisor) =>
                          `${supervisor.name} ${supervisor.email}`
                            .toLowerCase()
                            .includes(supervisorSearchQuery.toLowerCase())
                        )
                        .map((supervisor) => (
                          <Button
                            key={supervisor._id}
                            variant={formData.supervisorId === supervisor._id ? 'default' : 'ghost'}
                            className="w-full justify-start text-sm"
                            size="sm"
                            onClick={() => {
                              setFormData({ ...formData, supervisorId: supervisor._id });
                              setSupervisorSearchOpen(false);
                              setSupervisorSearchQuery('');
                            }}
                          >
                            <div className="text-left">
                              <div>{supervisor.name}</div>
                              <div className="text-xs text-muted-foreground">{supervisor.email}</div>
                            </div>
                          </Button>
                        ))}
                      {supervisors.filter((supervisor) =>
                        `${supervisor.name} ${supervisor.email}`
                          .toLowerCase()
                          .includes(supervisorSearchQuery.toLowerCase())
                      ).length === 0 && (
                        <p className="text-sm text-muted-foreground p-2 text-center">
                          No supervisors found
                        </p>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Semester Field - Dropdown */}
            <div>
              <Label htmlFor="semester" className="font-semibold">
                Semester <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.semester}
                onValueChange={(value) => setFormData({ ...formData, semester: value })}
              >
                <SelectTrigger className="mt-1" id="semester">
                  <SelectValue placeholder="Select a semester" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.length > 0 ? (
                    semesters.map((semester) => (
                      <SelectItem key={semester._id} value={semester._id}>
                        {semester.name}
                        {semester.description && ` - ${semester.description}`}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>
                      No semesters available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {semesters.length === 0 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  No semesters created. Please create a semester in Semester Management.
                </p>
              )}
            </div>

            {/* Number of Members */}
            <div>
              <Label htmlFor="numberOfMembers" className="font-semibold">
                Number of Members <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-4 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleNumberOfMembersChange(formData.numberOfMembers - 1)}
                  disabled={formData.numberOfMembers <= 3}
                  title={formData.numberOfMembers <= 3 ? 'Groups must have at least 3 members' : undefined}
                >
                  -
                </Button>
                <span className="text-center font-semibold text-lg w-12">
                  {formData.numberOfMembers}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleNumberOfMembersChange(formData.numberOfMembers + 1)}
                  disabled={formData.numberOfMembers >= 6}
                  title={formData.numberOfMembers >= 6 ? 'Groups can have at most 6 members' : undefined}
                >
                  +
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Select between 3 and 6 members
              </p>
            </div>

            {/* Student Fields */}
            <div className="space-y-4">
              <Label className="font-semibold">Students <span className="text-red-500">*</span></Label>
              {formData.students.map((student, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3 dark:border-slate-700">
                  <h4 className="font-medium">Student {index + 1}</h4>
                  
                  {/* Student Name Searchable Dropdown */}
                  <div>
                    <Label htmlFor={`student-name-${index}`} className="text-sm">
                      Student Name <span className="text-red-500">*</span>
                    </Label>
                    <Popover open={studentSearchOpen[index]} onOpenChange={(open) => handleStudentSearchOpen(index, open)}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={studentSearchOpen[index]}
                          className="w-full justify-between mt-1"
                        >
                          {student.name
                            ? students.find((s) => s._id === student.name)?.name
                            : 'Select student...'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <div className="p-3 border-b">
                          <Input
                            placeholder="Search by name or ID..."
                            value={studentSearchQuery[index] || ''}
                            onChange={(e) => handleStudentSearch(index, e.target.value)}
                            autoFocus
                            className="h-8"
                          />
                        </div>
                        {getFilteredStudents(index).length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            {students.length === 0 ? 'No students available.' : 'No student found.'}
                          </div>
                        ) : (
                          <div className="max-h-[300px] overflow-y-auto">
                            {getFilteredStudents(index).map((s) => (
                              <button
                                key={s._id}
                                onClick={() => {
                                  handleStudentChange(index, 'name', s._id);
                                  handleStudentSearchOpen(index, false);
                                }}
                                className="w-full px-4 py-2 text-left hover:bg-accent hover:text-accent-foreground border-b
 last:border-b-0 flex items-center justify-between transition-colors"
                              >
                                <div>
                                  <div className="font-medium text-sm">{s.name}</div>
                                  <div className="text-xs text-muted-foreground">{s.studentId}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Student ID (Auto-filled) */}
                  <div>
                    <Label htmlFor={`student-id-${index}`} className="text-sm">
                      Student ID <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={`student-id-${index}`}
                      value={student.id}
                      placeholder="Auto-filled when name is selected"
                      disabled
                      className="mt-1 text-sm bg-muted"
                    />
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Group Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.groupName}</DialogTitle>
            <DialogDescription>
              Capstone group details and members
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-6">
              {/* Course Information */}
              <div>
                <h3 className="font-semibold mb-3">Course Information</h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Course Code:</span>
                    <span className="font-medium">{selectedGroup.courseId?.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Course Name:</span>
                    <span className="font-medium">{selectedGroup.courseId?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Semester:</span>
                      <span className="font-medium">{getSemesterLabel(selectedGroup.semester)}</span>
                  </div>
                </div>
              </div>

              {/* Supervisor Information */}
              <div>
                <h3 className="font-semibold mb-3">Supervisor</h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{selectedGroup.supervisorId?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">{selectedGroup.supervisorId?.email}</span>
                  </div>
                </div>
              </div>

              {/* Group Members */}
              <div>
                <h3 className="font-semibold mb-3">Group Members ({selectedGroup.studentIds?.length || 0})</h3>
                <div className="border rounded-lg divide-y">
                  {selectedGroup.studentIds && selectedGroup.studentIds.length > 0 ? (
                    selectedGroup.studentIds.map((student, index) => (
                      <div key={student._id} className="p-3 flex justify-between items-center text-sm">
                        <span className="font-medium">{student.name}</span>
                        <span className="text-muted-foreground">{student.studentId}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">
                      No students in this group
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h3 className="font-semibold mb-3">Timeline</h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="font-medium">
                      {new Date(selectedGroup.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span className="font-medium">
                      {new Date(selectedGroup.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
            <Button 
              variant="default"
              onClick={handleEditClick}
            >
              Edit Group
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Capstone Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the group "{selectedGroup?.groupName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteGroup}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        if (!open && !updating) handleCloseEditDialog();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Capstone Group</DialogTitle>
            <DialogDescription>
              Update the course and semester for this capstone group
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-6">
            {/* Course Selection */}
            <div>
              <Label htmlFor="edit-courseId" className="font-semibold">
                Course <span className="text-red-500">*</span>
              </Label>
              <select
                id="edit-courseId"
                value={formData.courseId}
                onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md mt-1"
                required
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Field */}
            <div>
              <Label htmlFor="edit-semester" className="font-semibold">
                Semester <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.semester}
                onValueChange={(value) => setFormData({ ...formData, semester: value })}
              >
                <SelectTrigger className="mt-1" id="edit-semester">
                  <SelectValue placeholder="Select a semester" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.length > 0 ? (
                    semesters.map((semester) => (
                      <SelectItem key={semester._id} value={semester._id}>
                        {semester.name}
                        {semester.description ? ` - ${semester.description}` : ''}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>
                      No semesters available
                    </SelectItem>
                  )}
                  {formData.semester &&
                    !semesters.some(
                      (semester) => semester._id === formData.semester || semester.name === formData.semester
                    ) && (
                      <SelectItem value={formData.semester}>
                        Current semester (legacy value): {formData.semester}
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
              {semesters.length === 0 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  No semesters created. Please create a semester in Semester Management.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCloseEditDialog}
                disabled={updating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updating}>
                {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update Group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Submitted Marks Card */}
      <Card>
        <CardHeader>
          <CardTitle>Submitted Marks</CardTitle>
          <CardDescription>
            View and download marks submitted by supervisors in Excel format
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMarksFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : marksFiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No marks submitted yet
            </p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-3">File Name</th>
                      <th className="text-left py-2 px-3">Uploaded By</th>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksFiles.map((file) => (
                      <tr key={file._id} className="border-b hover:bg-muted">
                        <td className="py-2 px-3 font-medium">{file.originalName}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {file.uploadedBy?.name || 'Unknown'}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.location.href = `/api/resources/files/${file._id}`}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submitted Peer Marks Card */}
      <Card>
        <CardHeader>
          <CardTitle>Submitted Peer Evaluation Marks</CardTitle>
          <CardDescription>
            View and download peer evaluation marks submitted by supervisors in Excel format
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPeerMarksFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : peerMarksFiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No peer marks submitted yet
            </p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-3">File Name</th>
                      <th className="text-left py-2 px-3">Uploaded By</th>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peerMarksFiles.map((file) => (
                      <tr key={file._id} className="border-b hover:bg-muted">
                        <td className="py-2 px-3 font-medium">{file.originalName}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {file.uploadedBy?.name || 'Unknown'}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.location.href = `/api/resources/files/${file._id}`}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submitted Poster Marks Card */}
      <Card>
        <CardHeader>
          <CardTitle>Submitted Poster Marks</CardTitle>
          <CardDescription>
            View and download poster marks submitted by supervisors in Excel format
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPosterMarksFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : posterMarksFiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No poster marks submitted yet
            </p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-3">File Name</th>
                      <th className="text-left py-2 px-3">Uploaded By</th>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posterMarksFiles.map((file) => (
                      <tr key={file._id} className="border-b hover:bg-muted">
                        <td className="py-2 px-3 font-medium">{file.originalName}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {file.uploadedBy?.name || 'Unknown'}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.location.href = `/api/resources/files/${file._id}`}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  async function loadMarksFiles() {
    setLoadingMarksFiles(true);
    try {
      const res = await fetch('/api/capstone/marks-files');
      if (res.ok) {
        const data = await res.json();
        setMarksFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error loading marks files:', error);
      toast.error('Failed to load marks files');
    } finally {
      setLoadingMarksFiles(false);
    }
  }

  async function loadPeerMarksFiles() {
    setLoadingPeerMarksFiles(true);
    try {
      const res = await fetch('/api/capstone/peer-marks-files');
      if (res.ok) {
        const data = await res.json();
        setPeerMarksFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error loading peer marks files:', error);
      toast.error('Failed to load peer marks files');
    } finally {
      setLoadingPeerMarksFiles(false);
    }
  }

  async function loadPosterMarksFiles() {
    setLoadingPosterMarksFiles(true);
    try {
      const res = await fetch('/api/capstone/poster-marks-files');
      if (res.ok) {
        const data = await res.json();
        setPosterMarksFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error loading poster marks files:', error);
      toast.error('Failed to load poster marks files');
    } finally {
      setLoadingPosterMarksFiles(false);
    }
  }
}
