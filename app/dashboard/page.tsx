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
import { Loader2, Settings, LogOut, Plus, Upload, Copy, Edit, Trash2, BookOpen, FlaskConical, MoreVertical, Archive, Info, FileStack, AlertTriangle, FileText, Check, X, SkipForward } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { notify } from '@/app/utils/notifications';
import { CourseCombobox } from '@/app/components/CourseCombobox';
import { parsePdfRoster, courseCodeMatches, type PdfParseResult } from '@/lib/pdfStudentImport';
import { parseCSV } from '@/app/utils/csv';
import ChromeExtensionPromo from '@/components/ChromeExtensionPromo';

interface Course {
  _id: string;
  name: string;
  code: string;
  classTime?: string;
  classRoom?: string;
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

interface PdfSlotState {
  key: string;
  expectedCode: string;
  file: File | null;
  parsing: boolean;
  result: PdfParseResult | null;
  mismatchConfirmed: boolean;
}

function makeImportPdfSlots(code: string, aliasEnabled: boolean, alternateCode: string): PdfSlotState[] {
  const slots: PdfSlotState[] = [
    { key: 'primary', expectedCode: code, file: null, parsing: false, result: null, mismatchConfirmed: false },
  ];
  if (aliasEnabled && alternateCode.trim()) {
    slots.push({
      key: 'alias',
      expectedCode: alternateCode.trim(),
      file: null,
      parsing: false,
      result: null,
      mismatchConfirmed: false,
    });
  }
  return slots;
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
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [createdCourseForImport, setCreatedCourseForImport] = useState<Course | null>(null);
  const [importPdfSlots, setImportPdfSlots] = useState<PdfSlotState[]>([]);
  const [importingStudents, setImportingStudents] = useState(false);
  const [studentsImported, setStudentsImported] = useState<number | null>(null);
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

  // Some catalogue/registry entries don't have a real UNESCO code on file yet and
  // use the course code itself as a placeholder -- that's not an actual "New Code",
  // so don't treat it as one (it would otherwise always force New Code on).
  const isDistinctCode = (code: string, candidate?: string | null) =>
    Boolean(candidate && candidate.trim() && candidate.trim().toUpperCase() !== code.trim().toUpperCase());

  const handleCourseSelect = (course: AdminCourse | null) => {
    if (course) {
      setSelectedAdminCourse(course);
      setIsCustomCourse(false);
      const hasDistinctUnescoCode = isDistinctCode(course.courseCode, course.unescoCode);
      setFormData({
        ...formData,
        name: course.courseTitle,
        code: course.courseCode,
        aliasEnabled: hasDistinctUnescoCode,
        alternateCode: hasDistinctUnescoCode ? course.unescoCode! : '',
      });
      setDuplicateError('');

      // Admin catalogue doesn't have a distinct UNESCO code for this course yet --
      // fall back to the fixed registry so New Code is still auto-filled.
      if (!hasDistinctUnescoCode) {
        fetch(`/api/courses/catalogue-lookup?code=${encodeURIComponent(course.courseCode)}`)
          .then((res) => res.json())
          .then((data) => {
            if (isDistinctCode(course.courseCode, data.unescoCode)) {
              setFormData((prev) => ({ ...prev, aliasEnabled: true, alternateCode: data.unescoCode }));
            }
          })
          .catch(() => {});
      }
    } else {
      // Custom course option selected
      setSelectedAdminCourse(null);
      setIsCustomCourse(true);
      setFormData({
        ...formData,
        name: '',
        code: '',
        aliasEnabled: false,
        alternateCode: '',
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

  const ADD_WIZARD_STEPS = ['Course Identity', 'Details', 'New Code', 'Review', 'Import Students'];
  const REVIEW_STEP = 3;
  const IMPORT_STEP = 4;

  const isAddStepValid = (step: number) => {
    if (step === 0) return Boolean(formData.name.trim() && formData.code.trim());
    if (step === 1) return Boolean(formData.semester && formData.year && formData.section.trim() && formData.courseType && !duplicateError && !checkingDuplicate);
    if (step === 2) return !formData.aliasEnabled || Boolean(formData.alternateCode.trim());
    return true;
  };

  const resetAddCourseWizard = () => {
    setShowAddModal(false);
    setSelectedAdminCourse(null);
    setIsCustomCourse(false);
    setDuplicateError('');
    setAddWizardStep(0);
    setCreatedCourseForImport(null);
    setImportPdfSlots([]);
    setStudentsImported(null);
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
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (addWizardStep < REVIEW_STEP) {
      if (isAddStepValid(addWizardStep)) {
        setAddWizardStep(addWizardStep + 1);
      }
      return;
    }

    if (addWizardStep === IMPORT_STEP) {
      // Optional step -- just finish, the course was already created on Review.
      resetAddCourseWizard();
      return;
    }

    // On Review: actually create the course, then move to the optional Import Students step.
    setCreatingCourse(true);
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
      setCreatedCourseForImport(data.course);
      setImportPdfSlots(makeImportPdfSlots(data.course.code, Boolean(data.course.aliasEnabled), data.course.alternateCode || ''));
      setAddWizardStep(IMPORT_STEP);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setCreatingCourse(false);
    }
  };

  const applyImportPdfSlotsPreview = (slots: PdfSlotState[]) =>
    slots
      .filter((slot) => slot.result && (courseCodeMatches(slot.result.courseInfo.code, slot.expectedCode) || slot.mismatchConfirmed))
      .flatMap((slot) => slot.result!.studentLines);

  // If the newly created course doesn't have a class time/room yet, fill them in from a
  // trustworthy (matched or confirmed) PDF's detected schedule -- one-shot per wizard run.
  const maybeFillScheduleForNewCourse = async (result: PdfParseResult) => {
    if (!createdCourseForImport) return;
    const { classTime, classRoom } = result.courseInfo;
    const update: { classTime?: string; classRoom?: string } = {};
    if (!createdCourseForImport.classTime?.trim() && classTime) update.classTime = classTime;
    if (!createdCourseForImport.classRoom?.trim() && classRoom) update.classRoom = classRoom;
    if (Object.keys(update).length === 0) return;

    try {
      const res = await fetch(`/api/courses/${createdCourseForImport._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedCourseForImport(data.course);
        setCourses((prev) => prev.map((c) => (c._id === data.course._id ? data.course : c)));
        notify.success('Filled in class time/room from the PDF');
      }
    } catch (err) {
      console.error('Failed to auto-fill class time/room', err);
    }
  };

  const handleImportPdfFileSelect = async (slotKey: string, file: File) => {
    setImportPdfSlots((prev) => prev.map((s) => (s.key === slotKey ? { ...s, file, parsing: true, result: null, mismatchConfirmed: false } : s)));
    try {
      const result = await parsePdfRoster(file);
      setImportPdfSlots((prev) => prev.map((s) => (s.key === slotKey ? { ...s, parsing: false, result } : s)));
      const slot = importPdfSlots.find((s) => s.key === slotKey);
      if (courseCodeMatches(result.courseInfo.code, slot?.expectedCode || createdCourseForImport?.code || '')) {
        maybeFillScheduleForNewCourse(result);
      }
    } catch (err) {
      console.error('Failed to parse PDF', err);
      notify.error('Failed to read this PDF. Make sure it is a text-based (not scanned-image) PDF.');
      setImportPdfSlots((prev) => prev.map((s) => (s.key === slotKey ? { ...s, parsing: false } : s)));
    }
  };

  const handleImportPdfRemove = (slotKey: string) => {
    setImportPdfSlots((prev) => prev.map((s) => (s.key === slotKey ? { ...s, file: null, result: null, mismatchConfirmed: false } : s)));
  };

  const confirmImportPdfMismatch = (slotKey: string) => {
    setImportPdfSlots((prev) => {
      const next = prev.map((s) => (s.key === slotKey ? { ...s, mismatchConfirmed: true } : s));
      const confirmedSlot = next.find((s) => s.key === slotKey);
      if (confirmedSlot?.result) maybeFillScheduleForNewCourse(confirmedSlot.result);
      return next;
    });
  };

  const handleImportStudentsForNewCourse = async () => {
    if (!createdCourseForImport) return;
    const lines = applyImportPdfSlotsPreview(importPdfSlots);
    const parsedStudents = parseCSV(lines.join('\n'));
    if (parsedStudents.length === 0) {
      notify.error('No student rows found to import yet.');
      return;
    }

    setImportingStudents(true);
    try {
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: createdCourseForImport._id,
          students: parsedStudents.map((s) => ({ studentId: s.id, name: s.name })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import students');
      }
      const addedCount = data.students?.length || 0;
      setStudentsImported(addedCount);
      notify.success(`Imported ${addedCount} student${addedCount !== 1 ? 's' : ''}.`);
    } catch (err: any) {
      notify.error(err.message || 'Failed to import students');
    } finally {
      setImportingStudents(false);
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
      courseData.course.section = duplicateFormData.section;
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
      <ChromeExtensionPromo />
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b bg-background/80">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/dashboard">
                <Image
                  src="/ulab.svg"
                  alt="ULAB Logo"
                  width={100}
                  height={100}
                  className="drop-shadow-lg cursor-pointer hover:opacity-80 transition-opacity w-10 h-10 sm:w-[100px] sm:h-[100px] shrink-0"
                />
              </Link>
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent truncate">
                  Marks Management System
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  Welcome, {session?.user?.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <ThemeToggle />
              <Button variant="default" size="sm" asChild>
                <Link href="/resources">
                  <FileStack className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Resources</span>
                </Link>
              </Button>
              <Button variant="default" size="sm" asChild>
                <Link href="/capstone">
                  <FlaskConical className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Capstone</span>
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings">
                  <Settings className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Settings</span>
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
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">
              My Courses
            </h2>
            <p className="text-muted-foreground">
              Manage your courses and student marks
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href="/dashboard/archived">
                <Archive className="h-4 w-4 mr-2" />
                View Archived
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportModal(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Restore Course
            </Button>
            <Button
              size="sm"
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
        if (!open) {
          setError('');
          resetAddCourseWizard();
        } else {
          setShowAddModal(true);
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    {selectedAdminCourse && formData.alternateCode && (
                      <p className="text-xs text-muted-foreground">
                        Auto-filled from the course catalogue&apos;s UNESCO code. You can edit it.
                      </p>
                    )}
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

            {addWizardStep === IMPORT_STEP && createdCourseForImport && (
              <div className="space-y-3">
                <Alert>
                  <AlertDescription className="text-xs">
                    Optional: upload the attendance/roster PDF now to add your students right away.{' '}
                    <span className="font-medium">
                      You can re-upload again inside the course after the Add/Drop week finishes.
                    </span>
                  </AlertDescription>
                </Alert>

                {importPdfSlots.map((slot) => (
                  <div key={slot.key} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">PDF for {slot.expectedCode}</Label>
                      {slot.file && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs text-muted-foreground"
                          onClick={() => handleImportPdfRemove(slot.key)}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>

                    {!slot.file ? (
                      <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground cursor-pointer hover:border-primary/50">
                        <FileText className="w-5 h-5" />
                        Click to select a PDF
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImportPdfFileSelect(slot.key, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ) : slot.parsing ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Reading {slot.file.name}...
                      </div>
                    ) : slot.result ? (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {slot.file.name} &middot; {slot.result.studentLines.length} student row(s) found
                        </div>

                        {slot.result.courseInfo.code && courseCodeMatches(slot.result.courseInfo.code, slot.expectedCode) ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            Detected course {slot.result.courseInfo.code} matches {slot.expectedCode}
                          </div>
                        ) : slot.result.courseInfo.code ? (
                          <Alert variant="destructive" className="py-2">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <AlertDescription className="text-xs space-y-1.5">
                              <div>
                                This PDF looks like it&apos;s for course <strong>{slot.result.courseInfo.code}</strong>
                                {slot.result.courseInfo.name ? <> ({slot.result.courseInfo.name})</> : null}, not{' '}
                                <strong>{slot.expectedCode}</strong>.
                              </div>
                              {!slot.mismatchConfirmed ? (
                                <Button type="button" size="sm" variant="destructive" className="h-6 text-xs" onClick={() => confirmImportPdfMismatch(slot.key)}>
                                  Use it anyway
                                </Button>
                              ) : (
                                <div className="text-xs italic">Using this PDF anyway.</div>
                              )}
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert className="py-2">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <AlertDescription className="text-xs space-y-1.5">
                              <div>Couldn&apos;t detect a course code in this PDF -- please confirm it&apos;s the right file for {slot.expectedCode}.</div>
                              {!slot.mismatchConfirmed ? (
                                <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={() => confirmImportPdfMismatch(slot.key)}>
                                  Confirm and use
                                </Button>
                              ) : (
                                <div className="text-xs italic">Confirmed.</div>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}

                {applyImportPdfSlotsPreview(importPdfSlots).length > 0 && studentsImported === null && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={handleImportStudentsForNewCourse}
                    disabled={importingStudents}
                  >
                    {importingStudents ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      `Import ${applyImportPdfSlotsPreview(importPdfSlots).length} Student(s)`
                    )}
                  </Button>
                )}

                {studentsImported !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check className="w-4 h-4" />
                    Imported {studentsImported} student{studentsImported !== 1 ? 's' : ''}.
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError('');
                  resetAddCourseWizard();
                }}
              >
                {addWizardStep === IMPORT_STEP ? 'Close' : 'Cancel'}
              </Button>
              {addWizardStep > 0 && addWizardStep !== IMPORT_STEP && (
                <Button type="button" variant="outline" onClick={() => setAddWizardStep(addWizardStep - 1)}>
                  Back
                </Button>
              )}
              {addWizardStep < REVIEW_STEP ? (
                <Button type="submit" disabled={!isAddStepValid(addWizardStep)}>
                  Next
                </Button>
              ) : addWizardStep === REVIEW_STEP ? (
                <Button
                  type="submit"
                  disabled={!!duplicateError || checkingDuplicate || creatingCourse}
                >
                  {checkingDuplicate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : creatingCourse ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Course'
                  )}
                </Button>
              ) : (
                <Button type="submit">
                  <SkipForward className="h-4 w-4 mr-2" />
                  Finish
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
            <DialogTitle>Restore Course from Backup</DialogTitle>
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
