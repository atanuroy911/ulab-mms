'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Settings, LogOut, Plus, Upload, Copy, Edit, Trash2, BookOpen, FlaskConical, MoreVertical, Archive, Info, FileStack, AlertTriangle } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { notify } from '@/app/utils/notifications';
import { CourseCombobox } from '@/app/components/CourseCombobox';

interface Course {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
  section: string;
  courseType: 'Theory' | 'Lab';
  isArchived: boolean;
  createdAt: string;
  aliasEnabled?: boolean;
  alternateCode?: string;
}

interface AdminCourse {
  _id: string;
  courseCode: string;
  courseTitle: string;
  creditHour: number;
  prerequisite?: string;
  content?: string;
  unescoCode?: string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [deletingCourseLoading, setDeletingCourseLoading] = useState(false);
  const [duplicatingCourse, setDuplicatingCourse] = useState<Course | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'copy' | 'duplicate'>('duplicate');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    semester: 'Spring',
    year: new Date().getFullYear(),
    section: '1',
    courseType: 'Theory' as 'Theory' | 'Lab',
    aliasEnabled: false,
    alternateCode: '',
    classTime: '',
    classRoom: '',
  });
  const [addWizardStep, setAddWizardStep] = useState(0);
  const [selectedAdminCourse, setSelectedAdminCourse] = useState<AdminCourse | null>(null);
  const [isCustomCourse, setIsCustomCourse] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [editFormData, setEditFormData] = useState({
    name: '',
    code: '',
    semester: 'Spring',
    year: new Date().getFullYear(),
    section: 'A',
    courseType: 'Theory' as 'Theory' | 'Lab',
    aliasEnabled: false,
    alternateCode: '',
  });
  const [duplicateFormData, setDuplicateFormData] = useState({
    name: '',
    code: '',
    semester: 'Spring',
    year: new Date().getFullYear(),
    section: 'A',
    courseType: 'Theory' as 'Theory' | 'Lab',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'authenticated') {
      fetchCourses();
    }
  }, [status]);

  const fetchCourses = async () => {
    try {
      const response = await fetch('/api/courses');
      const data = await response.json();
      setCourses(data.courses || []);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSelect = (course: AdminCourse | null) => {
    if (course) {
      setSelectedAdminCourse(course);
      setIsCustomCourse(false);
      setFormData({
        ...formData,
        name: course.courseTitle,
        code: course.courseCode,
      });
      setDuplicateError('');
    } else {
      // Custom course option selected
      setSelectedAdminCourse(null);
      setIsCustomCourse(true);
      setFormData({
        ...formData,
        name: '',
        code: '',
      });
      setDuplicateError('');
    }
  };

  const checkDuplicate = async () => {
    if (!formData.code || !formData.semester || !formData.year || !formData.section) {
      return;
    }

    setCheckingDuplicate(true);
    setDuplicateError('');

    try {
      const response = await fetch(
        `/api/courses/check-duplicate?code=${encodeURIComponent(formData.code)}&semester=${formData.semester}&year=${formData.year}&section=${encodeURIComponent(formData.section)}`
      );
      const data = await response.json();

      if (data.exists) {
        setDuplicateError(`This course (${formData.code}) already exists for ${formData.semester} ${formData.year}, Section ${formData.section}`);
      }
    } catch (err) {
      console.error('Error checking duplicate:', err);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  // Check for duplicates when relevant fields change
  useEffect(() => {
    if (showAddModal && formData.code && formData.section) {
      const timer = setTimeout(() => {
        checkDuplicate();
      }, 500); // Debounce
      return () => clearTimeout(timer);
    }
  }, [formData.code, formData.semester, formData.year, formData.section, showAddModal]);

  const ADD_WIZARD_STEPS = ['Course Identity', 'Details', 'New Code', 'Review'];

  const isAddStepValid = (step: number) => {
    if (step === 0) return Boolean(formData.name.trim() && formData.code.trim());
    if (step === 1) return Boolean(formData.semester && formData.year && formData.section.trim() && formData.courseType && !duplicateError && !checkingDuplicate);
    if (step === 2) return !formData.aliasEnabled || Boolean(formData.alternateCode.trim());
    return true;
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (addWizardStep < ADD_WIZARD_STEPS.length - 1) {
      if (isAddStepValid(addWizardStep)) {
        setAddWizardStep(addWizardStep + 1);
      }
      return;
    }

    try {
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        notify.course.createError(data.error);
        setError(data.error || 'Failed to create course');
        return;
      }

      notify.course.created(data.course.name);
      setCourses([data.course, ...courses]);
      setShowAddModal(false);
      setSelectedAdminCourse(null);
      setIsCustomCourse(false);
      setDuplicateError('');
      setAddWizardStep(0);
      setFormData({
        name: '',
        code: '',
        semester: 'Spring',
        year: new Date().getFullYear(),
        section: '1',
        courseType: 'Theory',
        aliasEnabled: false,
        alternateCode: '',
        classTime: '',
        classRoom: '',
      });
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  const handleArchiveCourse = async (courseId: string, courseName: string) => {
    setArchiving(courseId);
    try {
      const response = await fetch(`/api/courses/${courseId}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      });

      if (response.ok) {
        notify.course.archived(courseName);
        setCourses(courses.filter(c => c._id !== courseId));
      } else {
        const data = await response.json();
        notify.course.archiveError(data.error);
      }
    } catch (err) {
      console.error('Error archiving course:', err);
      notify.course.archiveError();
    } finally {
      setArchiving(null);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!deletingCourse) return;
    setDeletingCourseLoading(true);

    try {
      const response = await fetch(`/api/courses/${deletingCourse._id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        notify.course.deleted(deletingCourse.name);
        setCourses(courses.filter((c) => c._id !== deletingCourse._id));
        setDeletingCourse(null);
      } else {
        notify.course.deleteError();
      }
    } catch (err) {
      console.error('Error deleting course:', err);
      notify.course.deleteError();
    } finally {
      setDeletingCourseLoading(false);
    }
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!editingCourse) return;

    try {
      const response = await fetch(`/api/courses/${editingCourse._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      const data = await response.json();

      if (!response.ok) {
        notify.course.updateError(data.error);
        setError(data.error || 'Failed to update course');
        return;
      }

      notify.course.updated(data.course.name);
      // Update the course in the list
      setCourses(courses.map(c => c._id === editingCourse._id ? data.course : c));
      setShowEditModal(false);
      setEditingCourse(null);
      setEditFormData({
        name: '',
        code: '',
        semester: 'Spring',
        year: new Date().getFullYear(),
        section: 'A',
        courseType: 'Theory',
        aliasEnabled: false,
        alternateCode: '',
      });
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  const openEditModal = (course: Course) => {
    setEditingCourse(course);
    setEditFormData({
      name: course.name,
      code: course.code,
      semester: course.semester,
      year: course.year,
      section: course.section,
      aliasEnabled: Boolean(course.aliasEnabled),
      alternateCode: course.alternateCode || '',
      courseType: course.courseType,
    });
    setShowEditModal(true);
  };

  const openDuplicateModal = (course: Course, mode: 'copy' | 'duplicate') => {
    setDuplicateMode(mode);
    setDuplicatingCourse(course);
    setDuplicateFormData({
      name: `${course.name} (${mode === 'copy' ? 'Copy' : 'Duplicate'})`,
      code: `${course.code}-${mode === 'copy' ? 'COPY' : 'DUP'}`,
      semester: course.semester,
      year: course.year,
      section: course.section,
      courseType: course.courseType,
    });
    setShowDuplicateModal(true);
  };

  const handleImportCourse = async () => {
    if (!importFile) {
      notify.exportImport.noFileSelected();
      return;
    }

    setImporting(true);
    try {
      const fileContent = await importFile.text();
      const courseData = JSON.parse(fileContent);

      // Validate the import file structure
      if (!courseData.version || !courseData.course || !courseData.students || !courseData.exams) {
        notify.exportImport.invalidFile();
        return;
      }

      const response = await fetch('/api/courses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(courseData),
      });

      if (response.ok) {
        const data = await response.json();
        notify.exportImport.importSuccess(`Course "${data.course.name}"`);
        setShowImportModal(false);
        setImportFile(null);
        await fetchCourses(); // Refresh the course list
      } else {
        const data = await response.json();
        notify.exportImport.importError(data.error);
      }
    } catch (err) {
      console.error('Import error:', err);
      notify.exportImport.importError();
    } finally {
      setImporting(false);
    }
  };

  const handleDuplicateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!duplicatingCourse) return;

    setDuplicating(true);
    try {
      // First, export the course data
      const exportResponse = await fetch(`/api/courses/${duplicatingCourse._id}/export`);
      if (!exportResponse.ok) {
        throw new Error('Failed to export course data');
      }
      const courseData = await exportResponse.json();

      // Update the course data with new details
      courseData.course.name = duplicateFormData.name;
      courseData.course.code = duplicateFormData.code;
      courseData.course.semester = duplicateFormData.semester;
      courseData.course.year = duplicateFormData.year;
      courseData.course.courseType = duplicateFormData.courseType;

      if (duplicateMode === 'copy') {
        courseData.students = [];
        courseData.marks = [];
        courseData.attendanceSessions = [];
      }

      // Import as a new course
      const importResponse = await fetch('/api/courses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(courseData),
      });

      if (importResponse.ok) {
        const data = await importResponse.json();
        notify.course.duplicated(data.course.name);
        setShowDuplicateModal(false);
        setDuplicatingCourse(null);
        setDuplicateFormData({
          name: '',
          code: '',
          semester: 'Spring',
          year: new Date().getFullYear(),
          section: 'A',
          courseType: 'Theory',
        });
        await fetchCourses(); // Refresh the course list
      } else {
        const data = await importResponse.json();
        notify.course.duplicateError(data.error);
        setError(data.error || 'Error duplicating course');
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      notify.course.duplicateError();
      setError('Error duplicating course. Please try again.');
    } finally {
      setDuplicating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b bg-background/80">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Image
                  src="/ulab.svg"
                  alt="ULAB Logo"
                  width={100}
                  height={100}
                  className="drop-shadow-lg cursor-pointer hover:opacity-80 transition-opacity"
                />
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Marks Management System
                </h1>
                <p className="text-xs text-muted-foreground">
                  Welcome, {session?.user?.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="default" asChild>
                <Link href="/resources">
                  <FileStack className="h-4 w-4 mr-2" />
                  Resources
                </Link>
              </Button>
              <Button variant="default" asChild>
                <Link href="/capstone">
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Capstone
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  notify.auth.signOutSuccess();
                  signOut({ callbackUrl: '/auth/signin' });
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">
              My Courses
            </h2>
            <p className="text-muted-foreground">
              Manage your courses and student marks
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              asChild
            >
              <Link href="/dashboard/archived">
                <Archive className="h-4 w-4 mr-2" />
                View Archived
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Course
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Course
            </Button>
          </div>
        </div>

        {/* Courses Grid */}
        {courses.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📚</span>
              </div>
              <CardTitle className="mb-2">
                No Courses Yet
              </CardTitle>
              <CardDescription className="mb-6">
                Get started by creating your first course
              </CardDescription>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Course
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Card
                key={course._id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      course.courseType === 'Theory' 
                        ? 'bg-gradient-to-br from-blue-600 to-cyan-600' 
                        : 'bg-gradient-to-br from-purple-600 to-pink-600'
                    }`}>
                      {course.courseType === 'Theory' ? (
                        <BookOpen className="h-6 w-6 text-white" />
                      ) : (
                        <FlaskConical className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(course)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDuplicateModal(course, 'copy')}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy (Exams Only)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDuplicateModal(course, 'duplicate')}>
                          <FileStack className="h-4 w-4 mr-2" />
                          Duplicate (All Data)
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleArchiveCourse(course._id, course.name)}
                          disabled={archiving === course._id}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          {archiving === course._id ? 'Archiving...' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingCourse(course)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="mt-4">{course.name}</CardTitle>
                  <CardDescription>{course.code}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="mb-4">
                    {course.courseType} Course
                  </Badge>
                  <div className="flex items-center gap-2 text-sm mb-4">
                    <Badge variant="outline">{course.semester}</Badge>
                    <Badge variant="outline">{course.year}</Badge>
                    <Badge variant="outline">Section {course.section}</Badge>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link href={`/course/${course._id}`}>
                      Open Course →
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Course Modal */}
      <Dialog open={showAddModal} onOpenChange={(open) => {
        setShowAddModal(open);
        if (!open) {
          setSelectedAdminCourse(null);
          setIsCustomCourse(false);
          setDuplicateError('');
          setError('');
          setAddWizardStep(0);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Course</DialogTitle>
            <DialogDescription>
              Step {addWizardStep + 1} of {ADD_WIZARD_STEPS.length}: {ADD_WIZARD_STEPS[addWizardStep]}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            {ADD_WIZARD_STEPS.map((stepLabel, idx) => (
              <div key={stepLabel} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    idx === addWizardStep
                      ? 'bg-primary text-primary-foreground'
                      : idx < addWizardStep
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {idx + 1}
                </div>
                {idx < ADD_WIZARD_STEPS.length - 1 && <div className={`h-px flex-1 ${idx < addWizardStep ? 'bg-primary/40' : 'bg-border'}`} />}
              </div>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {duplicateError && (
            <Alert variant="destructive">
              <AlertDescription>{duplicateError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleAddCourse} className="space-y-4">
            {addWizardStep === 0 && (
              <>
                {/* Course Selection from Catalogue */}
                <div className="space-y-2">
                  <Label>Select from Course Catalogue</Label>
                  <CourseCombobox
                    onSelect={handleCourseSelect}
                    selectedCourse={selectedAdminCourse}
                  />
                  <p className="text-xs text-muted-foreground">
                    Search by course code or title. Select &quot;Create custom course&quot; if not found.
                  </p>
                </div>

                {/* Show course info if selected from catalogue */}
                {selectedAdminCourse && (
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Info className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base">{selectedAdminCourse.courseTitle}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {selectedAdminCourse.courseCode} • {selectedAdminCourse.creditHour} Credit Hour{selectedAdminCourse.creditHour > 1 ? 's' : ''}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {selectedAdminCourse.prerequisite && (
                      <CardContent className="pt-0 pb-3">
                        <p className="text-xs text-muted-foreground">
                          <strong>Prerequisite:</strong> {selectedAdminCourse.prerequisite}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="course-name">Course Name</Label>
                    <Input
                      id="course-name"
                      type="text"
                      required
                      disabled={!isCustomCourse && selectedAdminCourse !== null}
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="e.g., Data Structures"
                      className={!isCustomCourse && selectedAdminCourse ? 'bg-muted' : ''}
                    />
                    {!isCustomCourse && selectedAdminCourse && (
                      <p className="text-xs text-muted-foreground">
                        Auto-filled from catalogue
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="course-code">Course Code</Label>
                    <Input
                      id="course-code"
                      type="text"
                      required
                      disabled={!isCustomCourse && selectedAdminCourse !== null}
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      placeholder="e.g., CSE201"
                      className={!isCustomCourse && selectedAdminCourse ? 'bg-muted' : ''}
                    />
                    {!isCustomCourse && selectedAdminCourse && (
                      <p className="text-xs text-muted-foreground">
                        Auto-filled from catalogue
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {addWizardStep === 1 && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="semester">Semester</Label>
                    <select
                      id="semester"
                      value={formData.semester}
                      onChange={(e) =>
                        setFormData({ ...formData, semester: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Spring">Spring</option>
                      <option value="Summer">Summer</option>
                      <option value="Fall">Fall</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      required
                      min="2000"
                      max="2100"
                      value={formData.year}
                      onChange={(e) =>
                        setFormData({ ...formData, year: parseInt(e.target.value) })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="section">Section</Label>
                    <Input
                      id="section"
                      type="text"
                      required
                      value={formData.section}
                      onChange={(e) =>
                        setFormData({ ...formData, section: e.target.value.toUpperCase() })
                      }
                      placeholder="e.g., 1"
                      maxLength={5}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="course-type">Course Type</Label>
                  <select
                    id="course-type"
                    value={formData.courseType}
                    onChange={(e) =>
                      setFormData({ ...formData, courseType: e.target.value as 'Theory' | 'Lab' })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="Theory">Theory Course</option>
                    <option value="Lab">Lab Course</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {formData.courseType === 'Theory'
                      ? '📖 Theory courses include Midterm and Final exams with CO breakdown'
                      : '🔬 Lab courses include Lab Final and OEL/CE Project'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="class-time">Class Time (optional)</Label>
                    <Input
                      id="class-time"
                      value={formData.classTime}
                      onChange={(e) => setFormData({ ...formData, classTime: e.target.value })}
                      placeholder="e.g., 10:00 AM - 12:00 PM"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="class-room">Class Room (optional)</Label>
                    <Input
                      id="class-room"
                      value={formData.classRoom}
                      onChange={(e) => setFormData({ ...formData, classRoom: e.target.value })}
                      placeholder="e.g., Lab 101"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Used to pre-fill the Attendance tab&apos;s class settings. You can change these later.
                </p>
              </>
            )}

            {addWizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Does this course have a New Code for some students?</Label>
                  <p className="text-xs text-muted-foreground">
                    Use this if some students (e.g. a newer admission batch) are officially registered under a different
                    course code for the same class. You&apos;ll be able to choose which students use it afterward.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!formData.aliasEnabled ? 'default' : 'outline'}
                      onClick={() => setFormData({ ...formData, aliasEnabled: false, alternateCode: '' })}
                    >
                      No
                    </Button>
                    <Button
                      type="button"
                      variant={formData.aliasEnabled ? 'default' : 'outline'}
                      onClick={() => setFormData({ ...formData, aliasEnabled: true })}
                    >
                      Yes
                    </Button>
                  </div>
                </div>

                {formData.aliasEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="alternate-code">New Code</Label>
                    <Input
                      id="alternate-code"
                      value={formData.alternateCode}
                      onChange={(e) => setFormData({ ...formData, alternateCode: e.target.value })}
                      placeholder="e.g., CSE470B"
                    />
                  </div>
                )}
              </div>
            )}

            {addWizardStep === 3 && (
              <div className="space-y-2 rounded-lg border divide-y">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Course</div>
                    <div className="font-medium">{formData.name || '—'} ({formData.code || '—'})</div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAddWizardStep(0)}>Edit</Button>
                </div>
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Details</div>
                    <div className="font-medium">{formData.semester} {formData.year} • Section {formData.section} • {formData.courseType}</div>
                    {(formData.classTime || formData.classRoom) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {[formData.classTime, formData.classRoom].filter(Boolean).join(' • ')}
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAddWizardStep(1)}>Edit</Button>
                </div>
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">New Code</div>
                    <div className="font-medium">{formData.aliasEnabled ? formData.alternateCode : 'Not used'}</div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAddWizardStep(2)}>Edit</Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setError('');
                  setDuplicateError('');
                  setSelectedAdminCourse(null);
                  setIsCustomCourse(false);
                  setAddWizardStep(0);
                }}
              >
                Cancel
              </Button>
              {addWizardStep > 0 && (
                <Button type="button" variant="outline" onClick={() => setAddWizardStep(addWizardStep - 1)}>
                  Back
                </Button>
              )}
              {addWizardStep < ADD_WIZARD_STEPS.length - 1 ? (
                <Button type="submit" disabled={!isAddStepValid(addWizardStep)}>
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!!duplicateError || checkingDuplicate}
                >
                  {checkingDuplicate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Create Course'
                  )}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Course Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleEditCourse} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-course-name">Course Name</Label>
              <Input
                id="edit-course-name"
                type="text"
                required
                value={editFormData.name}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, name: e.target.value })
                }
                placeholder="e.g., Data Structures"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-course-code">Course Code</Label>
              <Input
                id="edit-course-code"
                type="text"
                required
                value={editFormData.code}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, code: e.target.value })
                }
                placeholder="e.g., CSE201"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-semester">Semester</Label>
              <select
                id="edit-semester"
                value={editFormData.semester}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, semester: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Fall">Fall</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-year">Year</Label>
              <Input
                id="edit-year"
                type="number"
                required
                min="2000"
                max="2100"
                value={editFormData.year}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, year: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-section">Section</Label>
              <Input
                id="edit-section"
                type="text"
                required
                value={editFormData.section}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, section: e.target.value.toUpperCase() })
                }
                placeholder="e.g., A"
                maxLength={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-course-type">Course Type</Label>
              <select
                id="edit-course-type"
                value={editFormData.courseType}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, courseType: e.target.value as 'Theory' | 'Lab' })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="Theory">Theory Course</option>
                <option value="Lab">Lab Course</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {editFormData.courseType === 'Theory'
                  ? '📖 Theory courses include Midterm and Final exams with CO breakdown'
                  : '🔬 Lab courses include Lab Final and OEL/CE Project'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Does this course have a New Code for some students?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={!editFormData.aliasEnabled ? 'default' : 'outline'}
                  onClick={() => setEditFormData({ ...editFormData, aliasEnabled: false, alternateCode: '' })}
                >
                  No
                </Button>
                <Button
                  type="button"
                  variant={editFormData.aliasEnabled ? 'default' : 'outline'}
                  onClick={() => setEditFormData({ ...editFormData, aliasEnabled: true })}
                >
                  Yes
                </Button>
              </div>
              {editFormData.aliasEnabled && (
                <Input
                  value={editFormData.alternateCode}
                  onChange={(e) => setEditFormData({ ...editFormData, alternateCode: e.target.value })}
                  placeholder="e.g., CSE470B"
                  className="mt-2"
                />
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingCourse(null);
                  setError('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editFormData.aliasEnabled && !editFormData.alternateCode.trim()}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Course Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Course</DialogTitle>
            <DialogDescription>
              Select a course backup JSON file to import. This will create a new course with all students, exams, and marks from the backup.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertDescription>
              ⚠️ This will create a new course. The imported data will not affect existing courses.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="import-file">Select JSON Backup File</Label>
            <Input
              id="import-file"
              type="file"
              accept=".json"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
            {importFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {importFile.name}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportCourse}
              disabled={!importFile || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import Course'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Course Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{duplicateMode === 'copy' ? 'Copy Course (Exams Only)' : 'Duplicate Course (All Data)'}</DialogTitle>
            <DialogDescription>
              {duplicateMode === 'copy' 
                ? `This will create a new course with exams from `
                : `This will create a new course with all students, exams, marks, and attendance from `}
              <strong>{duplicatingCourse?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleDuplicateCourse} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dup-course-name">Course Name</Label>
              <Input
                id="dup-course-name"
                type="text"
                required
                value={duplicateFormData.name}
                onChange={(e) =>
                  setDuplicateFormData({ ...duplicateFormData, name: e.target.value })
                }
                placeholder="e.g., Data Structures (Copy)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dup-course-code">Course Code</Label>
              <Input
                id="dup-course-code"
                type="text"
                required
                value={duplicateFormData.code}
                onChange={(e) =>
                  setDuplicateFormData({ ...duplicateFormData, code: e.target.value })
                }
                placeholder="e.g., CSE201-COPY"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dup-semester">Semester</Label>
              <select
                id="dup-semester"
                value={duplicateFormData.semester}
                onChange={(e) =>
                  setDuplicateFormData({ ...duplicateFormData, semester: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Fall">Fall</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dup-year">Year</Label>
              <Input
                id="dup-year"
                type="number"
                required
                min="2000"
                max="2100"
                value={duplicateFormData.year}
                onChange={(e) =>
                  setDuplicateFormData({ ...duplicateFormData, year: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dup-section">Section</Label>
              <Input
                id="dup-section"
                type="text"
                required
                value={duplicateFormData.section}
                onChange={(e) =>
                  setDuplicateFormData({ ...duplicateFormData, section: e.target.value.toUpperCase() })
                }
                placeholder="e.g., A"
                maxLength={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dup-course-type">Course Type</Label>
              <select
                id="dup-course-type"
                value={duplicateFormData.courseType}
                onChange={(e) =>
                  setDuplicateFormData({ ...duplicateFormData, courseType: e.target.value as 'Theory' | 'Lab' })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="Theory">Theory Course</option>
                <option value="Lab">Lab Course</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {duplicateFormData.courseType === 'Theory' 
                  ? '📖 Theory courses include Midterm and Final exams with CO breakdown'
                  : '🔬 Lab courses include Lab Final and OEL/CE Project'}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicatingCourse(null);
                  setError('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={duplicating}>
                {duplicating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {duplicateMode === 'copy' ? 'Copying...' : 'Duplicating...'}
                  </>
                ) : (
                  duplicateMode === 'copy' ? 'Copy Course' : 'Duplicate Course'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <p>
                This will permanently delete <strong>{deletingCourse?.name}</strong> ({deletingCourse?.code}) and everything in it,
                including:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>All students enrolled in this course</li>
                <li>All exams and marks</li>
                <li>All attendance sessions and records</li>
                <li>All project group and marks data</li>
                <li>All capstone data tied to this course, if any</li>
              </ul>
              <p className="mt-2 font-medium">This cannot be undone.</p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCourse(null)} disabled={deletingCourseLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCourse} disabled={deletingCourseLoading}>
              {deletingCourseLoading ? 'Deleting...' : 'Delete Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
