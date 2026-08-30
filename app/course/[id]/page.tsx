'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ImportStudentsModal } from './components/ImportStudentsModal';
import ChromeExtensionPromo from '@/components/ChromeExtensionPromo';
import { AppHeader } from '@/app/components/AppHeader';
import AddMarkModal from '@/app/components/AddMarkModal';
import StudentDetailModal from '@/app/components/StudentDetailModal';
import OverviewView from './components/OverviewView';
import ExamsView from './components/ExamsView';
import StudentsView from './components/StudentsView';
import MarksView from './components/MarksView';
import AttendanceView from './components/AttendanceView';
import BulkMarkEntryModal from './components/BulkMarkEntryModal';
import BulkPasteMarkModal from '@/app/components/BulkPasteMarkModal';
import MarksStatisticsModal from '@/app/components/MarksStatisticsModal';
import ScaleMarksModal from '@/app/components/ScaleMarksModal';
import DictationMarkModal from '@/app/components/dictation/DictationMarkModal';
import ExcelExportMappingInfo from './components/ExcelExportMappingInfo';
import CoPoView from './components/CoPoView';
import ProjectView from './components/ProjectView';
import PopulateTestDataModal from './components/PopulateTestDataModal';
import { 
  GradeThreshold, 
  DEFAULT_GRADING_SCALE, 
  decodeGradingScale, 
  encodeGradingScale, 
  calculateLetterGrade, 
  validateGradingScale,
  getGradeDisplay,
  getGradeColor,
  getGradeBgColor 
} from '@/app/utils/grading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Settings, 
  LogOut, 
  ArrowLeft, 
  Plus, 
  Upload, 
  Download, 
  FileUp, 
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  Trash2,
  BookOpen,
  FlaskConical,
  Edit,
  Menu,
  Tag,
  AlertTriangle,
  LayoutDashboard,
  ClipboardList,
  Users,
  PenLine,
  CalendarCheck,
  Link2,
  Rocket,
  GraduationCap,
  Info
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { notify } from '@/app/utils/notifications';
import { toast } from 'sonner';
import { computeCoMarks } from '@/app/utils/bulkGridParsing';

interface Student {
  _id: string;
  studentId: string;
  name: string;
  withdrawn?: boolean;
  useAlias?: boolean;
}

interface Exam {
  _id: string;
  displayName: string;
  examType: 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom';
  totalMarks: number;
  weightage: number;
  isRequired: boolean;
  numberOfCOs?: number;
  numberOfQuestions?: number;
  examCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
  rubricTemplateId?: string;
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
  coMarks?: number[];
  questionMarks?: number[];
  weightedMark?: number;
}

interface Course {
  _id: string;
  name: string;
  code: string;
  classTime?: string;
  classRoom?: string;
  semester: string;
  year: number;
  courseType: 'Theory' | 'Lab';
  showFinalGrade: boolean;
  section: string;
  quizAggregation?: 'average' | 'best';
  assignmentAggregation?: 'average' | 'best' | 'sum';
  quizWeightage?: number;
  assignmentWeightage?: number;
  projectWeightage?: number;
  gradingScale?: string;
  coPoMapping?: {
    maxMarks: Record<string, number[]>;
    mapping: boolean[][];
    projectNumberOfCOs?: number;
    projectCoAutoDistribute?: boolean;
    projectCoMode?: 'marks' | 'weightage';
  };
  aliasEnabled?: boolean;
  alternateCode?: string;
  coPoMappingEnabled?: boolean;
}

export default function CoursePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showImportStudentsModal, setShowImportStudentsModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [showExamSettings, setShowExamSettings] = useState<string | null>(null);
  const [showCourseSettings, setShowCourseSettings] = useState(false);
  const [initialExamId, setInitialExamId] = useState<string | undefined>(undefined);
  const [initialStudentId, setInitialStudentId] = useState<string | undefined>(undefined);
  const [showStudentDetail, setShowStudentDetail] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showGradeBreakdown, setShowGradeBreakdown] = useState(false);
  const [selectedStudentForGrade, setSelectedStudentForGrade] = useState<Student | null>(null);
  const [showImportCourseModal, setShowImportCourseModal] = useState(false);
  const [importCourseFile, setImportCourseFile] = useState<File | null>(null);
  const [exportingJSON, setExportingJSON] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingCourseFile, setExportingCourseFile] = useState(false);
  const [exportingCourseFileGroup, setExportingCourseFileGroup] = useState<'main' | 'alias' | null>(null);
  const [exportingCourseFileAlpha, setExportingCourseFileAlpha] = useState(false);
  const [exportingCourseFileAlphaGroup, setExportingCourseFileAlphaGroup] = useState<'main' | 'alias' | null>(null);
  const [importingCourse, setImportingCourse] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [courseSettingsTab, setCourseSettingsTab] = useState<'aggregation' | 'grading' | 'excelExport' | 'alias' | 'copo'>('aggregation');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'exams' | 'students' | 'marks' | 'attendance' | 'copo' | 'project'>('overview');
  const [isGettingProjectMarks, setIsGettingProjectMarks] = useState(false);
  const [showPopulateModal, setShowPopulateModal] = useState(false);
  const [searchStudentId, setSearchStudentId] = useState('');
  const [showStudentStatsModal, setShowStudentStatsModal] = useState(false);
  const [selectedStudentForStats, setSelectedStudentForStats] = useState<Student | null>(null);
  const [showSetZeroModal, setShowSetZeroModal] = useState(false);
  const [showResetMarksModal, setShowResetMarksModal] = useState(false);
  const [showSetColumnMarkModal, setShowSetColumnMarkModal] = useState(false);
  const [setColumnMarkExamId, setSetColumnMarkExamId] = useState<string | null>(null);
  const [columnMarkValue, setColumnMarkValue] = useState('');
  const [settingColumnMark, setSettingColumnMark] = useState(false);
  const [showMarksStatsModal, setShowMarksStatsModal] = useState(false);
  const [scaleMarksExamId, setScaleMarksExamId] = useState<string | null>(null);
  const [scaleMarksInitialFrom, setScaleMarksInitialFrom] = useState<number | undefined>(undefined);
  const [selectedExamsForAction, setSelectedExamsForAction] = useState<string[]>([]);
  const [confirmationStep, setConfirmationStep] = useState(0);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [editStudentData, setEditStudentData] = useState({ studentId: '', name: '' });
  const [showDeleteStudentModal, setShowDeleteStudentModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleteConfirmationStep, setDeleteConfirmationStep] = useState(0);
  const [newStudentData, setNewStudentData] = useState({ studentId: '', name: '' });
  const [showBulkMarkModal, setShowBulkMarkModal] = useState(false);
  const [bulkMarkInitialExamId, setBulkMarkInitialExamId] = useState<string | undefined>(undefined);
  const [showBulkPasteModal, setShowBulkPasteModal] = useState(false);
  const [showDictationModal, setShowDictationModal] = useState(false);
  const [aliasCandidates, setAliasCandidates] = useState<Array<{ _id: string; studentId: string; name: string }>>([]);
  const [showAliasCategorizeModal, setShowAliasCategorizeModal] = useState(false);
  const [aliasCategorizing, setAliasCategorizing] = useState(false);
  const [isAutoCalculatingAttendance, setIsAutoCalculatingAttendance] = useState(false);
  // CO marks warning session state: tracks exam IDs the user has dismissed for this session
  const [ignoredCoWarnings, setIgnoredCoWarnings] = useState<Set<string>>(new Set());
  
  const [csvInput, setCsvInput] = useState('');
  const [examFormData, setExamFormData] = useState({
    displayName: '',
    totalMarks: '',
    weightage: '',
    numberOfCOs: '',
    numberOfQuestions: '',
    examCategory: '',
    rubricTemplateId: '',
  });
  const [rubricTemplates, setRubricTemplates] = useState<{ _id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    fetch('/api/rubrics')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRubricTemplates(Array.isArray(data) ? data : []))
      .catch(() => setRubricTemplates([]));
  }, []);

  const getInheritedExamWeightage = (examCategory: string) => {
    if (examCategory === 'Quiz') {
      return course?.quizWeightage ?? 0;
    }
    if (examCategory === 'Assignment') {
      return course?.assignmentWeightage ?? 0;
    }
    if (examCategory === 'Project') {
      return course?.projectWeightage ?? 25; // managed at course level
    }
    return null;
  };

  // Configure Quiz/Assignment(CLA)/Project group settings (total weightage + aggregation
  // method) from the exam-add flow (when it's still 0, i.e. never configured) or the
  // gear icon on the Exams accordion.
  const [categoryConfigDialog, setCategoryConfigDialog] = useState<{
    category: 'Quiz' | 'Assignment' | 'Project';
    thenOpenAddExam: boolean;
  } | null>(null);
  // Mirrors categoryConfigDialog's category but only updates while it's non-null, so the dialog's
  // content (which category-specific fields to show) stays stable during the close animation
  // instead of flashing to the "no category selected" state as categoryConfigDialog clears to null.
  const [displayedCategoryConfig, setDisplayedCategoryConfig] = useState<'Quiz' | 'Assignment' | 'Project' | null>(null);
  useEffect(() => {
    if (categoryConfigDialog) setDisplayedCategoryConfig(categoryConfigDialog.category);
  }, [categoryConfigDialog]);
  const [categoryConfigForm, setCategoryConfigForm] = useState({
    weightage: '',
    aggregation: 'average' as 'average' | 'best' | 'sum',
  });
  const [savingCategoryConfig, setSavingCategoryConfig] = useState(false);

  const openCategoryConfigDialog = (category: 'Quiz' | 'Assignment' | 'Project', thenOpenAddExam = false) => {
    const weightage = category === 'Quiz'
      ? course?.quizWeightage
      : category === 'Assignment'
      ? course?.assignmentWeightage
      : course?.projectWeightage;
    const aggregation = category === 'Quiz'
      ? course?.quizAggregation || 'average'
      : category === 'Assignment'
      ? course?.assignmentAggregation || 'average'
      : 'sum';

    setCategoryConfigForm({
      weightage: weightage ? String(weightage) : '',
      aggregation,
    });
    setCategoryConfigDialog({ category, thenOpenAddExam });

    if (category === 'Project' && course) {
      const savedNumberOfCOs = course.coPoMapping?.projectNumberOfCOs || 0;
      const savedAutoDistribute = course.coPoMapping?.projectCoAutoDistribute !== false;
      const savedMaxMarks = course.coPoMapping?.maxMarks?.['Project'] || [0, 0, 0, 0, 0, 0];
      const savedMode: 'marks' | 'weightage' = course.coPoMapping?.projectCoMode === 'weightage' ? 'weightage' : 'marks';
      const target = savedMode === 'marks'
        ? exams.filter(e => e.examCategory === 'Project').reduce((sum, e) => sum + (Number(e.totalMarks) || 0), 0)
        : Number(weightage || 0);
      setProjectCoForm({
        numberOfCOs: savedNumberOfCOs ? String(savedNumberOfCOs) : '',
        autoDistribute: savedAutoDistribute,
        maxMarks: savedAutoDistribute && savedNumberOfCOs
          ? distributeEvenly(target, savedNumberOfCOs)
          : savedMaxMarks,
        mode: savedMode,
      });
    }
  };

  const handleSaveCategoryConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryConfigDialog) return;

    const weightageNum = parseFloat(categoryConfigForm.weightage);
    if (isNaN(weightageNum) || weightageNum <= 0) {
      notify.error('Please enter a total weightage greater than 0');
      return;
    }

    const { category, thenOpenAddExam } = categoryConfigDialog;
    const updateData: any = {};
    if (category === 'Quiz') {
      updateData.quizWeightage = weightageNum;
      updateData.quizAggregation = categoryConfigForm.aggregation === 'best' ? 'best' : 'average';
    } else if (category === 'Assignment') {
      updateData.assignmentWeightage = weightageNum;
      updateData.assignmentAggregation = categoryConfigForm.aggregation;
    } else {
      updateData.projectWeightage = weightageNum;
    }

    setSavingCategoryConfig(true);
    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      // Project's Combined Course Outcomes section saves alongside the weightage here too, so
      // clicking the one "Save" button always persists everything shown in this dialog instead
      // of silently dropping the CO config unless the separate CO button was clicked.
      if (category === 'Project') {
        const coMaxMarks = projectCoForm.autoDistribute
          ? distributeEvenly(
              projectCoForm.mode === 'weightage' ? weightageNum : getProjectCoTarget('marks'),
              parseInt(projectCoForm.numberOfCOs) || 0
            )
          : projectCoForm.maxMarks;

        const copoResponse = await fetch(`/api/courses/${courseId}/copo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            maxMarks: { ...(course?.coPoMapping?.maxMarks || {}), Project: coMaxMarks },
            projectNumberOfCOs: parseInt(projectCoForm.numberOfCOs) || 0,
            projectCoAutoDistribute: projectCoForm.autoDistribute,
            projectCoMode: projectCoForm.mode,
          }),
        });
        if (!copoResponse.ok) {
          const copoData = await copoResponse.json().catch(() => ({}));
          throw new Error(copoData.error || 'Failed to save combined CO settings');
        }
      }

      await fetchCourseData();
      notify.success(`${category === 'Assignment' && course?.courseType === 'Lab' ? 'CLA' : category} settings saved`);
      setCategoryConfigDialog(null);

      if (thenOpenAddExam) {
        openExamModal(category);
      }
    } catch (err: any) {
      notify.error(err.message || 'Failed to save settings');
    } finally {
      setSavingCategoryConfig(false);
    }
  };

  const [examSettings, setExamSettings] = useState({
    displayName: '',
    weightage: '',
    numberOfCOs: '',
    numberOfQuestions: '',
    totalMarks: '',
    examCategory: '',
    rubricTemplateId: '',
  });
  // Combined CO configuration shared across every Project-category exam (not per-exam like other categories).
  const [projectCoForm, setProjectCoForm] = useState<{ numberOfCOs: string; autoDistribute: boolean; maxMarks: number[]; mode: 'marks' | 'weightage' }>({
    numberOfCOs: '',
    autoDistribute: true,
    maxMarks: [0, 0, 0, 0, 0, 0],
    mode: 'marks',
  });

  // What the combined CO max marks should sum to, depending on the selected mode: the raw total
  // marks across every Project-category exam, or the group's overall weightage percentage.
  const getProjectCoTarget = (mode: 'marks' | 'weightage') =>
    mode === 'marks'
      ? exams.filter(e => e.examCategory === 'Project').reduce((sum, e) => sum + (Number(e.totalMarks) || 0), 0)
      : parseFloat(categoryConfigForm.weightage) || 0;

  const distributeEvenly = (weightage: number, n: number): number[] => {
    const marks = [0, 0, 0, 0, 0, 0];
    if (n <= 0) return marks;
    const share = Math.floor((weightage / n) * 100) / 100;
    for (let i = 0; i < n; i++) marks[i] = share;
    // put the rounding remainder on the last CO so the total exactly matches the weightage
    const remainder = Math.round((weightage - share * n) * 100) / 100;
    marks[n - 1] = Math.round((marks[n - 1] + remainder) * 100) / 100;
    return marks;
  };

  const [courseSettingsData, setCourseSettingsData] = useState({
    quizAggregation: 'average' as 'average' | 'best',
    assignmentAggregation: 'average' as 'average' | 'best' | 'sum',
    quizWeightage: '',
    assignmentWeightage: '',
    projectWeightage: '',
    gradingScale: DEFAULT_GRADING_SCALE,
    showFinalGrade: false,
    aliasEnabled: false,
    alternateCode: '',
    coPoMappingEnabled: true,
  });
  const [error, setError] = useState('');
  const [courseCodeEditableByTeacher, setCourseCodeEditableByTeacher] = useState(true);

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId]);

  useEffect(() => {
    fetch('/api/auth/settings')
      .then((res) => res.json())
      .then((data) => setCourseCodeEditableByTeacher(data.courseCodeEditableByTeacher !== false))
      .catch(() => setCourseCodeEditableByTeacher(true));
  }, []);

  const fetchCourseData = async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}`);
      const data = await response.json();
      
      if (response.ok) {
        setCourse(data.course);
        setStudents(data.students || []);
        setExams(data.exams || []);
        setMarks(data.marks || []);
      }
    } catch (err) {
      console.error('Error fetching course data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWithdrawStudent = async (student: Student) => {
    const newStatus = !student.withdrawn;
    const action = newStatus ? 'withdraw' : 'un-withdraw';
    if (!confirm(`Are you sure you want to ${action} ${student.name}?`)) return;

    try {
      const response = await fetch(`/api/students/${student._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawn: newStatus }),
      });

      if (response.ok) {
        toast.success(`Student ${student.name} ${newStatus ? 'withdrawn' : 'un-withdrawn'} successfully`);
        await fetchCourseData();
      } else {
        const data = await response.json();
        toast.error(data.error || `Failed to ${action} student`);
      }
    } catch (err) {
      console.error('Error toggling withdraw status:', err);
      toast.error('An error occurred');
    }
  };



  const handleAddIndividualStudent = async () => {
    try {
      if (!newStudentData.studentId.trim() || !newStudentData.name.trim()) {
        notify.student.validationError('Please fill in both Student ID and Name');
        return;
      }

      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          students: [{
            studentId: newStudentData.studentId.trim(),
            name: newStudentData.name.trim(),
          }],
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchCourseData();
        setShowAddStudentModal(false);
        notify.student.added(newStudentData.name);
        setNewStudentData({ studentId: '', name: '' });
        await checkAliasCandidates(true);
      } else {
        notify.student.addError(data.error);
      }
    } catch (err) {
      console.error('Error adding student:', err);
      notify.student.addError();
    }
  };

  const checkAliasCandidates = async (silentIfNone = false) => {
    if (!course?.aliasEnabled) return;
    try {
      const res = await fetch(`/api/courses/${courseId}/students/alias-categorize`);
      const data = await res.json();
      if (res.ok && data.candidates?.length > 0) {
        setAliasCandidates(data.candidates);
        setShowAliasCategorizeModal(true);
      } else if (!silentIfNone) {
        notify.info('No students match the New Code batch rule right now.');
      }
    } catch (err) {
      console.error('Error checking alias candidates:', err);
    }
  };

  const applyAliasCategorize = async () => {
    setAliasCategorizing(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/students/alias-categorize`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        notify.success(`${data.updated} student(s) moved to the New Code`);
        setShowAliasCategorizeModal(false);
        setAliasCandidates([]);
        await fetchCourseData();
      } else {
        notify.error(data.error || 'Failed to auto-categorize students');
      }
    } catch (err) {
      console.error('Error applying alias categorize:', err);
      notify.error('Failed to auto-categorize students');
    } finally {
      setAliasCategorizing(false);
    }
  };

  const handleToggleAlias = async (student: Student) => {
    try {
      const res = await fetch(`/api/students/${student._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useAlias: !student.useAlias }),
      });
      if (res.ok) {
        await fetchCourseData();
      } else {
        const data = await res.json().catch(() => ({}));
        notify.error(data.error || 'Failed to update New Code status');
      }
    } catch (err) {
      console.error('Error toggling alias:', err);
      notify.error('Failed to update New Code status');
    }
  };

  const handleEditStudent = async () => {
    try {
      if (!editStudentData.studentId.trim() || !editStudentData.name.trim()) {
        notify.student.validationError('Please fill in both Student ID and Name');
        return;
      }

      if (!studentToEdit) return;

      const response = await fetch(`/api/students/${studentToEdit._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: editStudentData.studentId.trim(),
          name: editStudentData.name.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchCourseData();
        setShowEditStudentModal(false);
        setStudentToEdit(null);
        notify.student.updated(editStudentData.name);
        setEditStudentData({ studentId: '', name: '' });
      } else {
        notify.student.updateError(data.error);
      }
    } catch (err) {
      console.error('Error updating student:', err);
      notify.student.updateError();
    }
  };



  const handleDeleteStudent = async () => {
    if (!studentToDelete) return;

    try {
      const response = await fetch(`/api/students/${studentToDelete._id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchCourseData();
        setShowDeleteStudentModal(false);
        notify.student.deleted(studentToDelete.name);
        setStudentToDelete(null);
        setDeleteConfirmationStep(0);
      } else {
        const data = await response.json();
        notify.student.deleteError(data.error);
      }
    } catch (err) {
      console.error('Error deleting student:', err);
      notify.student.deleteError();
    }
  };

  const handleDeleteAllStudents = async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}/students`, {
        method: 'DELETE',
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await fetchCourseData();
        notify.student.bulkDeleted(data.deletedStudents || 0);
      } else {
        notify.student.bulkDeleteError(data.error);
      }
    } catch (err) {
      console.error('Error deleting all students:', err);
      notify.student.bulkDeleteError();
    }
  };

  const handleBulkDeleteStudents = async (studentIds: string[]) => {
    try {
      const response = await fetch(`/api/courses/${courseId}/students`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentIds }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await fetchCourseData();
        notify.student.bulkDeleted(data.deletedStudents || 0);
      } else {
        notify.student.bulkDeleteError(data.error);
      }
    } catch (err) {
      console.error('Error deleting selected students:', err);
      notify.student.bulkDeleteError();
    }
  };

  const handleBulkToggleWithdraw = async (studentIds: string[], withdrawn: boolean) => {
    try {
      const response = await fetch(`/api/courses/${courseId}/students`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds, withdrawn }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await fetchCourseData();
        toast.success(`${data.modifiedCount || studentIds.length} student(s) ${withdrawn ? 'marked as withdrawn' : 'un-withdrawn'}`);
      } else {
        toast.error(data.error || 'Failed to update withdraw status');
      }
    } catch (err) {
      console.error('Error bulk toggling withdraw status:', err);
      toast.error('An error occurred');
    }
  };

  const handleBulkToggleAlias = async (studentIds: string[], useAlias: boolean) => {
    try {
      const response = await fetch(`/api/courses/${courseId}/students`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds, useAlias }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await fetchCourseData();
        toast.success(`${data.modifiedCount || studentIds.length} student(s) ${useAlias ? 'added to' : 'removed from'} New Code`);
      } else {
        toast.error(data.error || 'Failed to update New Code status');
      }
    } catch (err) {
      console.error('Error bulk toggling alias status:', err);
      toast.error('An error occurred');
    }
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const examData: any = {
        courseId,
        displayName: examFormData.displayName,
        totalMarks: parseFloat(examFormData.totalMarks),
      };

      // Add examCategory if provided
      if (examFormData.examCategory) {
        examData.examCategory = examFormData.examCategory;
      }

      const inheritedWeightage = getInheritedExamWeightage(examFormData.examCategory);

      if (inheritedWeightage !== null) {
        examData.weightage = inheritedWeightage;
      } else {
        examData.weightage = parseFloat(examFormData.weightage);
      }

      // Add numberOfCOs if provided (for theory courses)
      if (examFormData.numberOfCOs) {
        examData.numberOfCOs = parseInt(examFormData.numberOfCOs);
      }

      // Add numberOfQuestions if provided
      if (examFormData.numberOfQuestions) {
        examData.numberOfQuestions = parseInt(examFormData.numberOfQuestions);
      }

      // Rubric template only applies to Project exams
      if (examFormData.examCategory === 'Project' && examFormData.rubricTemplateId) {
        examData.rubricTemplateId = examFormData.rubricTemplateId;
      }

      const response = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examData),
      });

      const data = await response.json();

      if (response.ok) {
        notify.exam.created(data.exam.displayName);
        setExams([...exams, data.exam]);
        setShowExamModal(false);
        setExamFormData({ displayName: '', totalMarks: '', weightage: '', numberOfCOs: '', numberOfQuestions: '', examCategory: '', rubricTemplateId: '' });
      } else {
        notify.exam.createError(data.error);
        setError(data.error);
      }
    } catch (err) {
      setError('Error creating exam');
    }
  };

  const openExamModal = (presetCategory?: Exam['examCategory']) => {
    // First time adding a Quiz/Assignment(CLA) item with no group weightage configured yet --
    // ask for the total weightage and aggregation method before letting them add the item.
    if (
      (presetCategory === 'Quiz' || presetCategory === 'Assignment') &&
      !getInheritedExamWeightage(presetCategory)
    ) {
      openCategoryConfigDialog(presetCategory, true);
      return;
    }

    // Project/OEL exams configure their combined CO count separately (via the group's gear
    // icon), so the per-exam numberOfCOs field is irrelevant for them and stays empty here.
    const defaultNumberOfCOs = '';

    if (presetCategory === 'Quiz' || presetCategory === 'Assignment' || presetCategory === 'Project') {
      const nextIndex = exams.filter((exam) => exam.examCategory === presetCategory).length + 1;
      const categoryLabel = presetCategory === 'Assignment' && course?.courseType === 'Lab' ? 'CLA' : presetCategory;
      setExamFormData({
        displayName: `${categoryLabel} ${nextIndex}`,
        totalMarks: '',
        weightage: '',
        numberOfCOs: defaultNumberOfCOs,
        numberOfQuestions: '',
        examCategory: presetCategory,
        rubricTemplateId: '',
      });
    } else {
      setExamFormData({
        displayName: '',
        totalMarks: '',
        weightage: '',
        numberOfCOs: defaultNumberOfCOs,
        numberOfQuestions: '',
        examCategory: presetCategory || '',
        rubricTemplateId: '',
      });
    }

    setError('');
    setShowExamModal(true);
  };

  const handleApplyScaling = async (examId: string, method: string) => {
    try {
      const response = await fetch('/api/scaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, method, applyRound: false }),
      });

      if (response.ok) {
        // Refresh course data to get updated marks
        await fetchCourseData();
        notify.scaling.applied(method);
      } else {
        notify.scaling.applyError();
      }
    } catch (err) {
      console.error('Error applying scaling:', err);
      notify.scaling.applyError();
    }
  };

  const handleSetEmptyMarksToZero = async (examIds: string[]) => {
    try {
      const marksToCreate = [];
      const targetExams = examIds.length === 0 ? exams : exams.filter(e => examIds.includes(e._id));
      
      for (const student of students) {
        for (const exam of targetExams) {
          const existingMark = marks.find(
            m => m.studentId === student._id && m.examId === exam._id
          );
          
          if (!existingMark) {
            marksToCreate.push({
              studentId: student._id,
              examId: exam._id,
              rawMark: 0,
            });
          }
        }
      }

      if (marksToCreate.length === 0) {
        notify.mark.allMarksExist();
        setShowSetZeroModal(false);
        setConfirmationStep(0);
        return;
      }

      const response = await fetch('/api/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: marksToCreate }),
      });

      if (response.ok) {
        await fetchCourseData();
        notify.mark.emptyMarksSet(marksToCreate.length);
        setShowSetZeroModal(false);
        setConfirmationStep(0);
      } else {
        const data = await response.json();
        notify.mark.emptyMarksError(data.error);
      }
    } catch (err) {
      console.error('Error setting empty marks to zero:', err);
      notify.mark.emptyMarksError();
    }
  };

  const handleSetColumnMark = async () => {
    if (!setColumnMarkExamId) return;
    const exam = exams.find(e => e._id === setColumnMarkExamId);
    if (!exam) return;

    const value = parseFloat(columnMarkValue);
    if (isNaN(value) || value < 0 || value > exam.totalMarks) {
      notify.error(`Mark must be between 0 and ${exam.totalMarks}`);
      return;
    }

    setSettingColumnMark(true);
    try {
      const numberOfCOs = exam.numberOfCOs || 0;
      const examMaxMarks = course?.coPoMapping?.maxMarks?.[exam._id];
      let successCount = 0;
      let failCount = 0;

      for (const student of students) {
        const { coMarks, nonCoMark } = computeCoMarks(value, numberOfCOs, exam.totalMarks, examMaxMarks);
        const response = await fetch('/api/marks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            studentId: student._id,
            examId: exam._id,
            rawMark: value,
            coMarks,
            nonCoMark,
          }),
        });

        if (response.ok) successCount++;
        else failCount++;
      }

      await fetchCourseData();

      if (successCount > 0) {
        notify.mark.bulkSaved(successCount);
      } else {
        notify.mark.bulkSaveError();
      }
      if (failCount > 0 && successCount > 0) {
        notify.mark.bulkSaveError(`${failCount} mark(s) failed to save`);
      }

      setShowSetColumnMarkModal(false);
      setSetColumnMarkExamId(null);
      setColumnMarkValue('');
    } catch (err) {
      console.error('Error setting column marks:', err);
      notify.mark.bulkSaveError();
    } finally {
      setSettingColumnMark(false);
    }
  };

  const handleResetMarks = async (examIds: string[]) => {
    try {
      const targetExams = examIds.length === 0 ? exams : exams.filter(e => examIds.includes(e._id));
      const examIdsToDelete = targetExams.map(e => e._id);
      
      const marksToDelete = marks.filter(m => examIdsToDelete.includes(m.examId));

      if (marksToDelete.length === 0) {
        notify.mark.noMarksToReset();
        setShowResetMarksModal(false);
        setConfirmationStep(0);
        return;
      }

      const response = await fetch('/api/marks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markIds: marksToDelete.map(m => m._id) }),
      });

      if (response.ok) {
        await fetchCourseData();
        notify.mark.marksReset(marksToDelete.length);
        setShowResetMarksModal(false);
        setConfirmationStep(0);
      } else {
        const data = await response.json();
        notify.mark.resetError(data.error);
      }
    } catch (err) {
      console.error('Error resetting marks:', err);
      notify.mark.resetError();
    }
  };

  const handleGetProjectMarks = async () => {
    setIsGettingProjectMarks(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/project/marks`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Project marks applied to ${data.updated} student(s) across: ${(data.examsUpdated || []).join(', ')}`);
        await fetchCourseData();
      } else {
        toast.error(data.error || 'Failed to get project marks');
      }
    } catch {
      toast.error('Error fetching project marks');
    } finally {
      setIsGettingProjectMarks(false);
    }
  };

  const handleAutoAttendanceMarks = async (examId: string) => {
    if (!confirm('This will fetch the attendance data and automatically calculate and save marks based on the attendance percentage. Any existing marks for this exam will be overwritten. Do you want to proceed?')) {
      return;
    }

    setIsAutoCalculatingAttendance(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/marks/auto-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Attendance marks calculated and saved successfully');
        await fetchCourseData();
      } else {
        toast.error(data.error || 'Failed to auto-calculate attendance marks');
      }
    } catch (err) {
      console.error('Error auto-calculating attendance marks:', err);
      toast.error('An error occurred while calculating attendance marks');
    } finally {
      setIsAutoCalculatingAttendance(false);
    }
  };


  const handleUpdateExamSettings = async () => {
    if (!showExamSettings) return;

    try {
      const previousExam = exams.find(e => e._id === showExamSettings);
      const updateData: any = {};
      if (examSettings.displayName) updateData.displayName = examSettings.displayName;
      if (examSettings.weightage) updateData.weightage = parseFloat(examSettings.weightage);
      if (examSettings.totalMarks) updateData.totalMarks = parseFloat(examSettings.totalMarks);
      if (examSettings.numberOfCOs) updateData.numberOfCOs = parseInt(examSettings.numberOfCOs);
      if (examSettings.numberOfQuestions) updateData.numberOfQuestions = parseInt(examSettings.numberOfQuestions);
      if (examSettings.examCategory) updateData.examCategory = examSettings.examCategory;
      if (examSettings.examCategory === 'Project') {
        updateData.rubricTemplateId = examSettings.rubricTemplateId || null;
      }

      const response = await fetch(`/api/exams/${showExamSettings}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        await fetchCourseData();
        notify.exam.settingsUpdated();

        // Total marks changed and marks already exist for this exam — offer to rescale them
        // instead of leaving old raw marks inconsistent with the new maximum. Ignorable.
        const newTotalMarks = updateData.totalMarks;
        if (
          previousExam &&
          newTotalMarks !== undefined &&
          newTotalMarks !== previousExam.totalMarks &&
          marks.some(m => m.examId === showExamSettings)
        ) {
          setScaleMarksExamId(showExamSettings);
          setScaleMarksInitialFrom(previousExam.totalMarks);
        }

        setShowExamSettings(null);
        setExamSettings({ displayName: '', weightage: '', numberOfCOs: '', numberOfQuestions: '', totalMarks: '', examCategory: '', rubricTemplateId: '' });
        setError('');
      } else {
        const data = await response.json();
        notify.exam.settingsError(data.error);
        setError(data.error);
      }
    } catch (err) {
      setError('Error updating exam settings');
    }
  };

  const handleProjectCoNumberChange = (value: string) => {
    const n = parseInt(value) || 0;
    setProjectCoForm(prev => ({
      ...prev,
      numberOfCOs: value,
      maxMarks: prev.autoDistribute ? distributeEvenly(getProjectCoTarget(prev.mode), n) : prev.maxMarks,
    }));
  };

  const handleProjectCoAutoDistributeToggle = (checked: boolean) => {
    setProjectCoForm(prev => ({
      ...prev,
      autoDistribute: checked,
      maxMarks: checked ? distributeEvenly(getProjectCoTarget(prev.mode), parseInt(prev.numberOfCOs) || 0) : prev.maxMarks,
    }));
  };

  const handleProjectCoModeChange = (mode: 'marks' | 'weightage') => {
    setProjectCoForm(prev => ({
      ...prev,
      mode,
      maxMarks: prev.autoDistribute ? distributeEvenly(getProjectCoTarget(mode), parseInt(prev.numberOfCOs) || 0) : prev.maxMarks,
    }));
  };

  const handleProjectCoMaxMarkChange = (coIndex: number, value: string) => {
    setProjectCoForm(prev => {
      const maxMarks = [...prev.maxMarks];
      maxMarks[coIndex] = value === '' ? 0 : parseFloat(value) || 0;
      return { ...prev, maxMarks };
    });
  };

  const handleDeleteExam = async (examId: string) => {
    const exam = exams.find(e => e._id === examId);
    
    if (!confirm(`Are you sure you want to delete ${exam?.displayName || 'this exam'}? This will delete all associated marks.`)) {
      return;
    }

    if (exam?.isRequired) {
      if (!confirm(`WARNING: ${exam.displayName} is a required core exam. Deleting it may affect standard grade calculations or course requirements. Are you absolutely sure you want to proceed?`)) {
        return;
      }
    }

    try {
      const response = await fetch(`/api/exams/${examId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchCourseData();
        const exam = exams.find(e => e._id === examId);
        notify.exam.deleted(exam?.displayName);
      } else {
        const data = await response.json();
        notify.exam.deleteError(data.error);
      }
    } catch (err) {
      console.error('Error deleting exam:', err);
      notify.exam.deleteError();
    }
  };

  const handleSaveCourseSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Validate grading scale
      const validationError = validateGradingScale(courseSettingsData.gradingScale);
      if (validationError) {
        setError(`Grading scale error: ${validationError}`);
        return;
      }

      if (courseSettingsData.aliasEnabled && !courseSettingsData.alternateCode.trim()) {
        setError('Please provide a New Code');
        return;
      }

      const updateData: any = {
        quizAggregation: courseSettingsData.quizAggregation,
        assignmentAggregation: courseSettingsData.assignmentAggregation,
        gradingScale: encodeGradingScale(courseSettingsData.gradingScale),
        showFinalGrade: courseSettingsData.showFinalGrade,
        aliasEnabled: courseSettingsData.aliasEnabled,
        alternateCode: courseSettingsData.alternateCode,
        coPoMappingEnabled: courseSettingsData.coPoMappingEnabled,
      };

      if (courseSettingsData.quizWeightage) {
        updateData.quizWeightage = parseFloat(courseSettingsData.quizWeightage);
      }
      if (courseSettingsData.assignmentWeightage) {
        updateData.assignmentWeightage = parseFloat(courseSettingsData.assignmentWeightage);
      }
      if (courseSettingsData.projectWeightage !== undefined) {
        updateData.projectWeightage = parseFloat(courseSettingsData.projectWeightage) || 0;
      }

      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        await fetchCourseData();
        setShowCourseSettings(false);
        notify.course.settingsSaved();
      } else {
        const data = await response.json();
        notify.course.settingsError(data.error);
        setError(data.error);
      }
    } catch (err) {
      setError('Error updating course settings');
    }
  };

  const handleExportCourse = async () => {
    setExportingJSON(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/export?format=json`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${course?.code}_${course?.name}_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        notify.exportImport.exportSuccess('JSON', `${course?.code}_${course?.name}`);
      } else {
        const data = await response.json();
        notify.exportImport.exportError(data.error);
      }
    } catch (err) {
      console.error('Export error:', err);
      notify.exportImport.exportError();
    } finally {
      setExportingJSON(false);
    }
  };

  const handleExportCSV = async () => {
    setExportingCSV(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/export?format=csv`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${course?.code}_${course?.name}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        notify.exportImport.exportSuccess('CSV', `${course?.code}_${course?.name}`);
      } else {
        const data = await response.json();
        notify.exportImport.exportError(data.error);
      }
    } catch (err) {
      console.error('Export error:', err);
      notify.exportImport.exportError();
    } finally {
      setExportingCSV(false);
    }
  };

  const downloadCourseFile = async (group: 'main' | 'alias', codeForFilename: string, endpoint = 'export-file', filenameTag = '') => {
    const response = await fetch(`/api/courses/${courseId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = course?.aliasEnabled ? (group === 'alias' ? '_newcode' : '_oldcode') : '';
    a.download = `${codeForFilename}_${course?.name}_course_file${filenameTag}${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportCourseFile = async () => {
    setExportingCourseFile(true);
    try {
      if (course?.aliasEnabled && course.alternateCode) {
        await downloadCourseFile('main', course.code);
        await downloadCourseFile('alias', course.alternateCode);
        notify.exportImport.exportSuccess('Excel', `${course.code} + ${course.alternateCode}`);
      } else {
        await downloadCourseFile('main', course?.code || '');
        notify.exportImport.exportSuccess('Excel', `${course?.code}_${course?.name}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      notify.exportImport.exportError(err instanceof Error ? err.message : undefined);
    } finally {
      setExportingCourseFile(false);
    }
  };

  // Downloads a single group's file only. Used for aliased courses, where firing both the
  // old-code and new-code downloads back-to-back (no user gesture between them) trips
  // Chrome's "this site is trying to download multiple files" block. Each button click here
  // is its own user gesture, so the browser lets it through.
  const handleExportCourseFileGroup = async (group: 'main' | 'alias') => {
    if (!course) return;
    setExportingCourseFileGroup(group);
    try {
      const codeForFilename = group === 'alias' ? (course.alternateCode || '') : course.code;
      await downloadCourseFile(group, codeForFilename);
      notify.exportImport.exportSuccess('Excel', codeForFilename);
    } catch (err) {
      console.error('Export error:', err);
      notify.exportImport.exportError(err instanceof Error ? err.message : undefined);
    } finally {
      setExportingCourseFileGroup(null);
    }
  };

  const handleExportCourseFileAlpha = async () => {
    setExportingCourseFileAlpha(true);
    try {
      if (course?.aliasEnabled && course.alternateCode) {
        await downloadCourseFile('main', course.code, 'export-copo-alpha', '_alpha');
        await downloadCourseFile('alias', course.alternateCode, 'export-copo-alpha', '_alpha');
        notify.exportImport.exportSuccess('Excel', `${course.code} + ${course.alternateCode}`);
      } else {
        await downloadCourseFile('main', course?.code || '', 'export-copo-alpha', '_alpha');
        notify.exportImport.exportSuccess('Excel', `${course?.code}_${course?.name}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      notify.exportImport.exportError(err instanceof Error ? err.message : undefined);
    } finally {
      setExportingCourseFileAlpha(false);
    }
  };

  // Same reasoning as handleExportCourseFileGroup - one user-gesture download per click so
  // aliased courses don't trip Chrome's multi-download warning.
  const handleExportCourseFileAlphaGroup = async (group: 'main' | 'alias') => {
    if (!course) return;
    setExportingCourseFileAlphaGroup(group);
    try {
      const codeForFilename = group === 'alias' ? (course.alternateCode || '') : course.code;
      await downloadCourseFile(group, codeForFilename, 'export-copo-alpha', '_alpha');
      notify.exportImport.exportSuccess('Excel', codeForFilename);
    } catch (err) {
      console.error('Export error:', err);
      notify.exportImport.exportError(err instanceof Error ? err.message : undefined);
    } finally {
      setExportingCourseFileAlphaGroup(null);
    }
  };

  const handleImportCourse = async () => {
    if (!importCourseFile) {
      notify.exportImport.noFileSelected();
      return;
    }

    setImportingCourse(true);
    try {
      const fileContent = await importCourseFile.text();
      const courseData = JSON.parse(fileContent);

      const response = await fetch(`/api/courses/${courseId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(courseData),
      });

      if (response.ok) {
        await fetchCourseData();
        setShowImportCourseModal(false);
        setImportCourseFile(null);
        notify.exportImport.importSuccess('Course data');
      } else {
        const data = await response.json();
        notify.exportImport.importError(data.error);
      }
    } catch (err) {
      console.error('Import error:', err);
      notify.exportImport.importError();
    } finally {
      setImportingCourse(false);
    }
  };

  const handlePopulateTestData = async (): Promise<{ studentsAdded: number; marksAdded: number } | null> => {
    const repopulate = students.length > 0;
    setIsPopulating(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/populate-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repopulate }),
      });
      const data = await response.json();
      if (response.ok) {
        await fetchCourseData();
        return { studentsAdded: data.studentsAdded, marksAdded: data.marksAdded };
      } else {
        toast.error(data.error || 'Failed to populate test data');
        return null;
      }
    } catch (err) {
      toast.error('Error populating test data');
      return null;
    } finally {
      setIsPopulating(false);
    }
  };

  const getMark = (studentId: string, examId: string) => {
    return marks.find(m => m.studentId.toString() === studentId.toString() && m.examId.toString() === examId.toString());
  };

  /**
   * Returns the subset of exams that have COs enabled but no CO max marks configured
   * in coPoMapping.maxMarks for this course. Used to drive the CO warning banner.
   */
  const getExamsWithMissingCOMarks = () => {
    if (!course) return [];
    if (course.coPoMappingEnabled === false) return [];
    const coPoMaxMarks = course.coPoMapping?.maxMarks || {};
    const perExam = exams.filter(exam => {
      if (exam.examCategory === 'Project') return false; // handled by the combined check below
      if (!exam.numberOfCOs || exam.numberOfCOs < 1) return false;
      // Ignored for this session
      if (ignoredCoWarnings.has(exam._id)) return false;
      const maxMarksForExam = coPoMaxMarks[exam._id];
      // Missing or all zeros means not configured
      const configured = maxMarksForExam && maxMarksForExam.slice(0, exam.numberOfCOs).some(m => m > 0);
      return !configured;
    }).map(e => ({ _id: e._id, displayName: e.displayName }));

    const projectNumberOfCOs = course.coPoMapping?.projectNumberOfCOs || 0;
    const hasProjectExams = exams.some(e => e.examCategory === 'Project');
    if (hasProjectExams && projectNumberOfCOs > 0 && !ignoredCoWarnings.has('__project-combined-co__')) {
      const projectMax = coPoMaxMarks['Project'];
      const configured = projectMax && projectMax.slice(0, projectNumberOfCOs).some((m: number) => m > 0);
      if (!configured) {
        perExam.push({ _id: '__project-combined-co__', displayName: `Combined ${course.courseType === 'Lab' ? 'OEL/CE' : 'Project'} COs` });
      }
    }

    return perExam;
  };

  const handleIgnoreCOWarning = (examId: string) => {
    setIgnoredCoWarnings(prev => new Set([...prev, examId]));
  };

  const handleIgnoreAllCOWarnings = () => {
    const allCoExamIds = exams
      .filter(e => e.numberOfCOs && e.numberOfCOs > 0)
      .map(e => e._id);
    setIgnoredCoWarnings(prev => new Set([...prev, ...allCoExamIds]));
  };

  /**
   * Returns the CO-PO readiness status for the export warning:
   * - 'no-mapping': coPoMapping.mapping is entirely false (no PO connections set at all)
   * - 'no-max-marks': mapping is set but some CO-enabled exams have no max marks
   * - 'ok': everything looks good
   */
  const getCoPoStatus = (): 'no-mapping' | 'no-max-marks' | 'ok' => {
    if (!course) return 'ok';
    if (course.coPoMappingEnabled === false) return 'ok';
    const mapping = course.coPoMapping?.mapping;
    const maxMarks = course.coPoMapping?.maxMarks || {};
    // Check if mapping matrix exists and has at least one true value
    const hasAnyMapping = mapping && mapping.some(row => row.some(cell => cell === true));
    if (!hasAnyMapping) return 'no-mapping';
    // Check if any CO-enabled exam is missing max marks
    const hasMissingMaxMarks = exams.some(exam => {
      if (exam.examCategory === 'Project') return false; // handled by the combined check below
      if (!exam.numberOfCOs || exam.numberOfCOs < 1) return false;
      const examMaxMarks = maxMarks[exam._id];
      return !examMaxMarks || !examMaxMarks.slice(0, exam.numberOfCOs).some((m: number) => m > 0);
    });
    if (hasMissingMaxMarks) return 'no-max-marks';
    const projectNumberOfCOs = course.coPoMapping?.projectNumberOfCOs || 0;
    if (exams.some(e => e.examCategory === 'Project') && projectNumberOfCOs > 0) {
      const projectMax = maxMarks['Project'];
      const configured = projectMax && projectMax.slice(0, projectNumberOfCOs).some((m: number) => m > 0);
      if (!configured) return 'no-max-marks';
    }
    return 'ok';
  };

  const getExamPercentage = (rawMark: number, totalMarks: number) => {
    if (!totalMarks || totalMarks <= 0) return 0;
    return (rawMark / totalMarks) * 100;
  };

  const getWeightedContribution = (rawMark: number, totalMarks: number, weightage: number) => {
    return (getExamPercentage(rawMark, totalMarks) * weightage) / 100;
  };

  // Calculate aggregated mark for a student based on exam category
  const getAggregatedMark = (studentId: string, category: 'Quiz' | 'Assignment'): Mark | { rawMark: number; isAggregated: boolean; examId?: string } | null => {
    // Get all exams of this category
    const categoryExams = exams.filter(exam => exam.examCategory === category);
    
    if (categoryExams.length === 0) return null;

    // Get all marks for this student in this category
    const categoryMarks = categoryExams
      .map(exam => getMark(studentId, exam._id))
      .filter(mark => mark !== undefined);

    if (categoryMarks.length === 0) return null;

    // Calculate based on aggregation method
    const aggregationMethod = category === 'Quiz' 
      ? course?.quizAggregation || 'average'
      : course?.assignmentAggregation || 'average';

    const categoryWeightage = category === 'Quiz'
      ? Number(course?.quizWeightage || 0)
      : Number(course?.assignmentWeightage || 0);

    if (aggregationMethod === 'best') {
      // Find the best normalized score (highest percentage), not the highest raw mark
      let bestMark = categoryMarks[0];
      let bestValue = -1;

      categoryMarks.forEach(mark => {
        const exam = categoryExams.find(e => e._id === mark.examId);
        if (exam) {
          const percentage = getExamPercentage(mark.rawMark, exam.totalMarks);
          if (percentage > bestValue) {
            bestValue = percentage;
            bestMark = mark;
          }
        }
      });

      const bestExam = categoryExams.find(e => e._id === bestMark.examId);
      const weightedMark = bestExam ? getWeightedContribution(bestMark.rawMark, bestExam.totalMarks, categoryWeightage) : 0;

      return {
        rawMark: weightedMark,
        isAggregated: true,
        examId: bestMark.examId,
      };
    } else if (aggregationMethod === 'sum') {
      // Sum raw marks and totals across scored exams, then weight the combined percentage
      const sumRaw = categoryMarks.reduce((sum, mark) => sum + mark.rawMark, 0);
      const sumTotal = categoryMarks.reduce((sum, mark) => {
        const exam = categoryExams.find(e => e._id === mark.examId);
        return exam ? sum + exam.totalMarks : sum;
      }, 0);

      const weightedSum = sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;

      return {
        rawMark: weightedSum,
        isAggregated: true,
      };
    } else {
      // Calculate average of normalized percentages and convert to weighted contribution
      const averagePercentage = categoryMarks.reduce((sum, mark) => {
        const exam = categoryExams.find(e => e._id === mark.examId);
        if (!exam) return sum;
        return sum + getExamPercentage(mark.rawMark, exam.totalMarks);
      }, 0) / categoryMarks.length;

      const weightedAverage = (averagePercentage * categoryWeightage) / 100;

      // Return a synthetic mark object for display
      return {
        rawMark: weightedAverage,
        isAggregated: true,
      };
    }
  };

  const selectedExamForSettings = showExamSettings
    ? exams.find(exam => exam._id === showExamSettings)
    : null;

  // Project-category exams use a combined CO configuration (shared across all Project exams,
  // scaled to the project weightage) instead of a per-exam CO count — see the Project CO panel.
  const canEditCOs =
    examSettings.examCategory !== 'Project' &&
    (course?.courseType === 'Theory' ||
      (course?.courseType === 'Lab' &&
        (selectedExamForSettings?.examType === 'labFinal' ||
          selectedExamForSettings?.examType === 'oel')));

  // Check if we should show aggregated columns
  const hasQuizzes = exams.some(exam => exam.examCategory === 'Quiz');
  const hasAssignments = exams.some(exam => exam.examCategory === 'Assignment');
  const hasProjects = exams.some(exam => exam.examCategory === 'Project');

  // Calculate project aggregated mark: sum all raw marks, convert to weightage
  // Formula: (sumRaw / sumTotal) × projectWeightage
  const getProjectAggregatedMark = (studentId: string): { rawMark: number; sumRaw: number; sumTotal: number; isAggregated: boolean } | null => {
    const projectExams = exams.filter(e => e.examCategory === 'Project');
    if (projectExams.length === 0) return null;
    const projectMarks = projectExams
      .map(e => ({ exam: e, mark: marks.find(m => m.studentId.toString() === studentId.toString() && m.examId.toString() === e._id.toString()) }))
      .filter(x => x.mark !== undefined);
    if (projectMarks.length === 0) return null;
    const sumRaw = projectMarks.reduce((s, x) => s + Number(x.mark!.rawMark ?? 0), 0);
    // sumTotal is the total marks of only the exams that have been scored
    const sumTotal = projectMarks.reduce((s, x) => s + Number(x.exam.totalMarks ?? 0), 0);
    const projectWeightage = Number(course?.projectWeightage || 0);
    const weighted = sumTotal > 0 ? (sumRaw / sumTotal) * projectWeightage : 0;
    return { rawMark: Math.round(weighted * 100) / 100, sumRaw, sumTotal, isAggregated: true };
  };

  // Calculate final grade for a student
  const calculateFinalGrade = (studentId: string): { total: number; breakdown: Array<{ name: string; mark: number; totalMarks: number; weightage: number; contribution: number; isAggregated?: boolean }> } => {
    const breakdown: Array<{ name: string; mark: number; totalMarks: number; weightage: number; contribution: number; isAggregated?: boolean }> = [];
    let totalContribution = 0;

    // Process individual exams (non-Quiz, non-Assignment, non-Project)
    exams.forEach(exam => {
      if (exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project') {
        return; // handled by aggregated columns
      }

      const mark = getMark(studentId, exam._id);
      if (mark) {
        const contribution = mark.weightedMark !== undefined && mark.weightedMark !== null
          ? mark.weightedMark
          : (mark.rawMark / exam.totalMarks) * exam.weightage;
        
        breakdown.push({
          name: exam.displayName,
          mark: mark.rawMark,
          totalMarks: exam.totalMarks,
          weightage: exam.weightage,
          contribution: contribution,
        });
        
        totalContribution += contribution;
      }
    });

    // Add Quiz aggregated column if exists
    if (hasQuizzes && course?.quizWeightage) {
      const aggMark = getAggregatedMark(studentId, 'Quiz');
      if (aggMark) {
        const totalMarks = Number(course.quizWeightage);
        const contribution = aggMark.rawMark;
        
        breakdown.push({
          name: 'Quiz (Aggregated)',
          mark: contribution,
          totalMarks: totalMarks,
          weightage: totalMarks,
          contribution: contribution,
          isAggregated: true,
        });
        
        totalContribution += contribution;
      }
    }

    // Add Assignment aggregated column if exists
    if (hasAssignments && course?.assignmentWeightage) {
      const aggMark = getAggregatedMark(studentId, 'Assignment');
      if (aggMark) {
        const totalMarks = Number(course.assignmentWeightage);
        const contribution = aggMark.rawMark;
        breakdown.push({
          name: `${course?.courseType === 'Lab' ? 'Assessment' : 'Assignment'} (Aggregated)`,
          mark: contribution,
          totalMarks: totalMarks,
          weightage: totalMarks,
          contribution: contribution,
          isAggregated: true,
        });
        totalContribution += contribution;
      }
    }

    // Add Project aggregated column (sum-based)
    if (hasProjects && course?.projectWeightage) {
      const aggMark = getProjectAggregatedMark(studentId);
      if (aggMark) {
        const totalMarks = Number(course.projectWeightage);
        breakdown.push({
          name: 'Project (Aggregated)',
          mark: aggMark.rawMark,
          totalMarks: totalMarks,
          weightage: totalMarks,
          contribution: aggMark.rawMark,
          isAggregated: true,
        });
        totalContribution += aggMark.rawMark;
      }
    }

    return {
      total: totalContribution,
      breakdown: breakdown,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="border-b bg-background/80">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-[50px] w-[50px] rounded-md shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex h-[calc(100dvh-72px)]">
          <div className="hidden md:block w-64 border-r bg-card p-3 space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
          <div className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-9 w-9 rounded-lg" />
                    </div>
                    <Skeleton className="h-7 w-16" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Course not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Helper functions for student stats modal
  const handleStudentSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchStudentId.trim()) return;
    
    const student = students.find(s => 
      s.studentId.toLowerCase().includes(searchStudentId.toLowerCase()) ||
      s.name.toLowerCase().includes(searchStudentId.toLowerCase())
    );
    
    if (student) {
      setSelectedStudent(student);
      setShowStudentDetail(true);
      notify.student.searchSuccess(student.name);
      setSearchStudentId('');
    } else {
      notify.student.notFound(searchStudentId);
    }
  };

  const getStudentMarks = (studentId: string) => {
    return marks.filter(m => m.studentId === studentId);
  };

  const calculateTotalWeightage = () => {
    return exams.reduce((sum, exam) => sum + exam.weightage, 0);
  };

  const getClassStatsForExam = (examId: string) => {
    const examMarks = marks.filter(m => m.examId === examId);
    if (examMarks.length === 0) return null;

    const exam = exams.find(e => e._id === examId);
    const values = examMarks.map(m => m.rawMark);

    return {
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
      highest: Math.max(...values),
      lowest: Math.min(...values),
      count: values.length
    };
  };

  const calculateEstimatedGrade = (studentId: string) => {
    const gradeData = calculateFinalGrade(studentId);
    const studentMarks = marks.filter(m => m.studentId === studentId);
    const completedExams = studentMarks.length;
    const totalExams = exams.length;
    const remainingExams = totalExams - completedExams;
    
    if (remainingExams === 0) {
      return null; // All exams completed
    }

    // Calculate remaining weightage
    const completedWeightage = exams
      .filter(exam => studentMarks.some(m => m.examId === exam._id))
      .reduce((sum, exam) => sum + exam.weightage, 0);
    
    const remainingWeightage = calculateTotalWeightage() - completedWeightage;

    // Calculate what's needed for different grade targets
    const targets = [
      { grade: 'A', min: 80 },
      { grade: 'B', min: 65 },
      { grade: 'C', min: 50 },
      { grade: 'D', min: 40 },
    ];

    const estimates = targets.map(target => {
      const neededTotal = target.min;
      const neededFromRemaining = neededTotal - gradeData.total;
      const averageNeeded = remainingWeightage > 0 ? (neededFromRemaining / remainingWeightage) * 100 : 0;
      
      return {
        grade: target.grade,
        targetPercentage: target.min,
        averageNeeded: Math.max(0, averageNeeded),
        achievable: averageNeeded <= 100 && averageNeeded >= 0
      };
    });

    return {
      completedExams,
      totalExams,
      remainingExams,
      completedWeightage,
      remainingWeightage,
      currentPoints: gradeData.total,
      estimates
    };
  };

  return (
    <>
    <div className="min-h-screen">
      <ChromeExtensionPromo />
      <AppHeader
        title={course.name}
        icon={course?.courseType === 'Theory' ? BookOpen : FlaskConical}
        subtitle={
          <>
            {course.code} • {course.semester} {course.year} • Section {course.section} •{' '}
            <Badge variant="secondary" className="ml-1">
              {course.courseType}
            </Badge>
          </>
        }
        actions={[
          { key: 'settings', label: 'Settings', icon: Settings, href: '/settings', variant: 'outline' },
          { key: 'dashboard', label: 'Dashboard', icon: ArrowLeft, href: '/dashboard', variant: 'outline' },
          {
            key: 'signout',
            label: 'Sign Out',
            icon: LogOut,
            variant: 'destructive',
            onClick: () => {
              notify.auth.signOutSuccess();
              signOut({ callbackUrl: '/auth/signin' });
            },
          },
        ]}
        bottomBar={
          <div className="md:hidden bg-background/95 backdrop-blur-md border-b overflow-x-auto">
            <div className="flex items-center gap-1.5 px-3 py-2 min-w-max">
              {([
                ['overview', LayoutDashboard, 'Overview'],
                ['exams', ClipboardList, 'Exams'],
                ['students', Users, 'Students'],
                ['marks', PenLine, 'Marks'],
                ['attendance', CalendarCheck, 'Attendance'],
                ['copo', Link2, 'CO PO'],
                ['project', course?.courseType === 'Lab' ? Rocket : GraduationCap, course?.courseType === 'Lab' ? 'OEL/CE' : 'Project'],
              ] as const).map(([view, Icon, label]) => (
                <Button
                  key={view}
                  variant={activeView === view ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveView(view)}
                  className="shrink-0"
                >
                  <Icon className="w-4 h-4 mr-1.5" />{label}
                </Button>
              ))}
            </div>
          </div>
        }
      />

      {/* Sidebar + Main Content Layout */}
      <div className="flex h-[calc(100dvh-72px)]">
        {/* Left Sidebar — desktop/tablet only; mobile users switch views with the tab bar above */}
        <aside className={`hidden md:flex ${
          sidebarOpen ? 'w-64' : 'w-16'
        } transition-all duration-300 border-r bg-card flex-col`}>
          {/* Sidebar Header */}
          <div className="h-16 flex items-center px-4 border-b shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full justify-start"
            >
              <Menu className="w-5 h-5" />
              {sidebarOpen && <span className="ml-2 font-medium">Menu</span>}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <Button
              variant={activeView === 'overview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('overview')}
              className="w-full justify-start h-11"
            >
              <LayoutDashboard className="w-5 h-5" />
              {sidebarOpen && <span className="ml-2 font-medium">Overview</span>}
            </Button>

            <Button
              variant={activeView === 'exams' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('exams')}
              className="w-full justify-start h-11"
            >
              <ClipboardList className="w-5 h-5" />
              {sidebarOpen && (
                <div className="flex-1 flex items-center justify-between ml-2">
                  <span className="font-medium">Exams</span>
                  <Badge variant="secondary" className="ml-2">{exams.length}</Badge>
                </div>
              )}
            </Button>

            <Button
              variant={activeView === 'students' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('students')}
              className="w-full justify-start h-11"
            >
              <Users className="w-5 h-5" />
              {sidebarOpen && (
                <div className="flex-1 flex items-center justify-between ml-2">
                  <span className="font-medium">Students</span>
                  <Badge variant="secondary" className="ml-2">{students.length}</Badge>
                </div>
              )}
            </Button>

            <Button
              variant={activeView === 'marks' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('marks')}
              className="w-full justify-start h-11"
            >
              <PenLine className="w-5 h-5" />
              {sidebarOpen && <span className="ml-2 font-medium">Marks</span>}
            </Button>

            <Button
              variant={activeView === 'attendance' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('attendance')}
              className="w-full justify-start h-11"
            >
              <CalendarCheck className="w-5 h-5" />
              {sidebarOpen && <span className="ml-2 font-medium">Attendance</span>}
            </Button>

            <Button
              variant={activeView === 'copo' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('copo')}
              className="w-full justify-start h-11"
            >
              <Link2 className="w-5 h-5" />
              {sidebarOpen && <span className="ml-2 font-medium">CO PO Mapping</span>}
            </Button>

            <Button
              variant={activeView === 'project' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('project')}
              className="w-full justify-start h-11"
            >
              {course?.courseType === 'Lab' ? <Rocket className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
              {sidebarOpen && <span className="ml-2 font-medium">
                {course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'}
              </span>}
            </Button>

            {sidebarOpen && <div className="pt-4 mt-4 border-t"></div>}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCourseSettingsData({
                  quizAggregation: course?.quizAggregation || 'average',
                  assignmentAggregation: course?.assignmentAggregation || 'average',
                  quizWeightage: course?.quizWeightage?.toString() || '',
                  assignmentWeightage: course?.assignmentWeightage?.toString() || '',
                  projectWeightage: course?.projectWeightage?.toString() || '',
                  gradingScale: course?.gradingScale
                    ? decodeGradingScale(course.gradingScale)
                    : DEFAULT_GRADING_SCALE,
                  showFinalGrade: Boolean(course?.showFinalGrade),
                  aliasEnabled: Boolean(course?.aliasEnabled),
                  alternateCode: course?.alternateCode || '',
                  coPoMappingEnabled: course?.coPoMappingEnabled !== false,
                });
                setShowCourseSettings(true);
              }}
              className="w-full justify-start h-11"
            >
              <Settings className="w-5 h-5" />
              {sidebarOpen && <span className="ml-2 font-medium">Course Settings</span>}
            </Button>
          </nav>

          {/* Student Search */}
          <div className="px-4 py-3 border-t border-b">
            {sidebarOpen ? (
              <form onSubmit={handleStudentSearch} className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  Search Student
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={searchStudentId}
                    onChange={(e) => setSearchStudentId(e.target.value)}
                    placeholder="ID or Name"
                    className="flex-1 h-8 text-sm"
                  />
                  <Button type="submit" size="sm" className="h-8 px-3">
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="w-full"
                title="Search Student"
              >
                <Search className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Quick Actions */}
          {sidebarOpen && (
            <div className="p-3 border-t space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCourse}
                disabled={!course || exportingJSON}
                className="w-full"
              >
                {exportingJSON ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportCourseModal(true)}
                className="w-full"
              >
                <FileUp className="w-4 h-4 mr-2" />
                Import
              </Button>
              {course?.code === 'TESTCODE123' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowPopulateModal(true)}
                  disabled={isPopulating}
                  className={`w-full text-white mt-2 ${
                    students.length > 0
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {students.length > 0 ? (
                    <>
                      <FlaskConical className="w-4 h-4 mr-2" />
                      Re-populate Test Data
                    </>
                  ) : (
                    <>
                      <FlaskConical className="w-4 h-4 mr-2" />
                      Populate Test Data
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6">
            {/* Overview View */}
            {activeView === 'overview' && (
              <OverviewView
                course={course!}
                students={students}
                exams={exams}
                marks={marks}
                onImportStudents={() => setShowImportStudentsModal(true)}
                onAddExam={() => setShowExamModal(true)}
                onImportCourse={() => setShowImportCourseModal(true)}
                onExportCSV={handleExportCSV}
                exportingCSV={exportingCSV}
                onExportCourseFile={handleExportCourseFile}
                exportingCourseFile={exportingCourseFile}
                onExportCourseFileGroup={handleExportCourseFileGroup}
                exportingCourseFileGroup={exportingCourseFileGroup}
                onExportCourseFileAlpha={handleExportCourseFileAlpha}
                exportingCourseFileAlpha={exportingCourseFileAlpha}
                onExportCourseFileAlphaGroup={handleExportCourseFileAlphaGroup}
                exportingCourseFileAlphaGroup={exportingCourseFileAlphaGroup}
                calculateFinalGrade={calculateFinalGrade}
                coPoStatus={getCoPoStatus()}
                onGoToCoPo={() => setActiveView('copo')}
              />
            )}

            {/* Exams View */}
            {activeView === 'exams' && (
              <ExamsView
                exams={exams}
                course={course!}
                onShowExamModal={openExamModal}
                onShowExamSettings={(examId) => setShowExamSettings(examId)}
                onSetExamSettings={setExamSettings}
                onDeleteExam={handleDeleteExam}
                onConfigureCategory={(category) => openCategoryConfigDialog(category, false)}
                onExamsChanged={fetchCourseData}
              />
            )}

            {/* Students View */}
            {activeView === 'students' && (
              <StudentsView
                students={students}
                exams={exams}
                marks={marks}
                course={course}
                hasQuizzes={hasQuizzes}
                hasAssignments={hasAssignments}
                hasProjects={hasProjects}
                getMark={getMark}
                getAggregatedMark={getAggregatedMark}
                getProjectAggregatedMark={getProjectAggregatedMark}
                calculateFinalGrade={calculateFinalGrade}
                calculateLetterGrade={calculateLetterGrade}
                getGradeDisplay={getGradeDisplay}
                getGradeColor={getGradeColor}
                getGradeBgColor={getGradeBgColor}
                onShowAddStudentModal={() => setShowAddStudentModal(true)}
                onShowBulkAddStudentModal={() => setShowImportStudentsModal(true)}
                onEditStudent={(student) => {
                  setStudentToEdit(student);
                  setEditStudentData({ studentId: student.studentId, name: student.name });
                  setShowEditStudentModal(true);
                }}
                onShowStudentDetail={(student) => {
                  setSelectedStudent(student);
                  setShowStudentDetail(true);
                }}
                onShowGradeBreakdown={(student) => {
                  setSelectedStudentForGrade(student);
                  setShowGradeBreakdown(true);
                }}
                onDeleteStudent={(student) => {
                  setStudentToDelete(student);
                  setDeleteConfirmationStep(0);
                  setShowDeleteStudentModal(true);
                }}
                onDeleteAllStudents={handleDeleteAllStudents}
                onBulkDeleteStudents={handleBulkDeleteStudents}
                onToggleWithdrawStudent={handleToggleWithdrawStudent}
                onToggleAlias={handleToggleAlias}
                onBulkToggleWithdraw={handleBulkToggleWithdraw}
                onBulkToggleAlias={handleBulkToggleAlias}
                onAutoCategorizeAlias={() => checkAliasCandidates(false)}
              />
            )}

            {/* Marks View */}
            {activeView === 'marks' && (
              <MarksView
                students={students}
                exams={exams}
                marks={marks}
                getMark={getMark}
                onShowMarkModal={(examId, studentId) => {
                  setInitialExamId(examId);
                  setInitialStudentId(studentId);
                  setShowMarkModal(true);
                }}
                onShowBulkMarkModal={(examId) => {
                  setBulkMarkInitialExamId(examId);
                  setShowBulkMarkModal(true);
                }}
                onShowBulkPasteModal={() => setShowBulkPasteModal(true)}
                onShowDictationModal={() => setShowDictationModal(true)}
                onShowSetZeroModal={() => {
                  setSelectedExamsForAction([]);
                  setConfirmationStep(0);
                  setShowSetZeroModal(true);
                }}
                onShowResetMarksModal={(examId) => {
                  if (examId) {
                    setSelectedExamsForAction([examId]);
                    setConfirmationStep(1);
                  } else {
                    setSelectedExamsForAction([]);
                    setConfirmationStep(0);
                  }
                  setShowResetMarksModal(true);
                }}
                onShowExamSettings={(examId) => {
                  const exam = exams.find((e) => e._id === examId);
                  if (!exam) return;
                  setShowExamSettings(examId);
                  setExamSettings({
                    displayName: exam.displayName,
                    weightage: exam.weightage.toString(),
                    totalMarks: exam.totalMarks.toString(),
                    numberOfCOs: exam.numberOfCOs?.toString() || '',
                    numberOfQuestions: exam.numberOfQuestions?.toString() || '',
                    examCategory: exam.examCategory || '',
                    rubricTemplateId: exam.rubricTemplateId || '',
                  });
                }}
                onShowSetColumnMarkModal={(examId) => {
                  setSetColumnMarkExamId(examId);
                  setColumnMarkValue('');
                  setShowSetColumnMarkModal(true);
                }}
                onShowStatisticsModal={() => setShowMarksStatsModal(true)}
                onShowScaleMarksModal={(examId) => {
                  setScaleMarksExamId(examId);
                  setScaleMarksInitialFrom(undefined);
                }}
                onAutoAttendanceMarks={handleAutoAttendanceMarks}
                isAutoCalculatingAttendance={isAutoCalculatingAttendance}
                onGetProjectMarks={handleGetProjectMarks}
                isGettingProjectMarks={isGettingProjectMarks}
                courseType={course?.courseType}
                examsWithMissingCO={getExamsWithMissingCOMarks()}
                onGoToCoPo={() => setActiveView('copo')}
                onIgnoreCOWarning={handleIgnoreAllCOWarnings}
              />
            )}

            {activeView === 'project' && (
              <ProjectView
                courseId={courseId}
                students={students}
                exams={exams}
                title={course?.courseType === 'Lab' ? 'OEL / CE Project Groups' : 'Project Groups'}
                description={course?.courseType === 'Lab' ? 'Score each group\'s OEL / CE project using the rubric. Marks are pushed to the Marks tab.' : undefined}
                examFilter={(e) => e.examCategory === 'Project'}
                courseType={course?.courseType}
                defaultProjectWeightage={course?.projectWeightage ?? 25}
                projectNumberOfCOs={course?.coPoMapping?.projectNumberOfCOs || 0}
                projectCoMaxMarks={course?.coPoMapping?.maxMarks?.['Project']}
                projectCoMode={course?.coPoMapping?.projectCoMode === 'weightage' ? 'weightage' : 'marks'}
                onEditProjectCoSettings={() => openCategoryConfigDialog('Project')}
                onExamsChanged={fetchCourseData}
              />
            )}

            {/* Attendance View */}
            {activeView === 'attendance' && (
              <AttendanceView courseId={courseId} />
            )}

            {/* CO-PO Mapping View */}
            {activeView === 'copo' && (
              <CoPoView 
                course={course} 
                exams={exams} 
                onUpdate={fetchCourseData} 
              />
            )}

            {/* Empty States */}
            {activeView === 'students' && students.length === 0 && (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="text-6xl mb-4">👨‍🎓</div>
                  <CardTitle className="text-xl mb-2">No Students Yet</CardTitle>
                  <CardDescription className="mb-6">
                    Import students using CSV to get started
                  </CardDescription>
                  <Button onClick={() => setShowImportStudentsModal(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Students
                  </Button>
                </CardContent>
              </Card>
            )}
          </div> {/* Close max-w-7xl */}
        </main>
      </div> {/* Close flex container */}
    </div> {/* Close min-h-screen */}

    {/* Modals - Rendered as siblings for proper z-index */}
    <div>
      <ImportStudentsModal
        isOpen={showImportStudentsModal}
        onClose={() => setShowImportStudentsModal(false)}
        students={students}
        courseId={courseId}
        course={{
          code: course?.code || '',
          name: course?.name,
          aliasEnabled: course?.aliasEnabled,
          alternateCode: course?.alternateCode,
          classTime: course?.classTime,
          classRoom: course?.classRoom,
        }}
        onCourseUpdated={() => {
          fetchCourseData();
        }}
        onImportComplete={async () => {
          await fetchCourseData();
          await checkAliasCandidates(true);
        }}
      />

      {/* Alias auto-categorize confirmation */}
      <Dialog open={showAliasCategorizeModal} onOpenChange={(open) => !open && setShowAliasCategorizeModal(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Move New Batch Students to New Code?
            </DialogTitle>
            <DialogDescription>
              {aliasCandidates.length} student{aliasCandidates.length !== 1 ? 's' : ''} (batch 25 or later) will be
              grouped under the New Code &quot;{course?.alternateCode}&quot; instead of &quot;{course?.code}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {aliasCandidates.map((s) => (
              <div key={s._id} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{s.studentId}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            You can add or remove individual students from the New Code group anytime from the student list.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAliasCategorizeModal(false)} disabled={aliasCategorizing}>
              Not Now
            </Button>
            <Button onClick={applyAliasCategorize} disabled={aliasCategorizing}>
              {aliasCategorizing ? 'Applying...' : 'Confirm Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Exam Modal */}
      <Dialog open={showExamModal} onOpenChange={setShowExamModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Exam</DialogTitle>
          </DialogHeader>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleAddExam} className="space-y-4">
            <div>
              <Label>Exam Name</Label>
              <Input
                type="text"
                required
                value={examFormData.displayName}
                onChange={(e) => setExamFormData({ ...examFormData, displayName: e.target.value })}
                placeholder="e.g., Quiz 1"
                className="mt-2"
              />
            </div>

            <div>
              <Label>Exam Category</Label>
              <select
                required
                value={examFormData.examCategory}
                onChange={(e) => {
                  const nextCategory = e.target.value;

                  // First time picking Quiz/Assignment(CLA) with no group weightage configured
                  // yet -- ask for it now, then come back to this form.
                  if (
                    (nextCategory === 'Quiz' || nextCategory === 'Assignment') &&
                    !getInheritedExamWeightage(nextCategory)
                  ) {
                    setExamFormData({ ...examFormData, examCategory: nextCategory });
                    openCategoryConfigDialog(nextCategory as 'Quiz' | 'Assignment', false);
                    return;
                  }

                  const inheritedWeightage = getInheritedExamWeightage(nextCategory);

                  setExamFormData({
                    ...examFormData,
                    examCategory: nextCategory,
                    weightage: inheritedWeightage !== null ? inheritedWeightage.toString() : examFormData.weightage,
                  });
                }}
                className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
              >
                <option value="">Select category...</option>
                <option value="Quiz">Quiz</option>
                <option value="Assignment">{course?.courseType === 'Lab' ? 'Continuous Lab Assessment (CLA)' : 'Assignment'}</option>
                <option value="Project">{course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'}</option>
                <option value="Attendance">Attendance</option>
                <option value="MainExam">Main Exam</option>
                <option value="ClassPerformance">Class Performance</option>
                <option value="Others">Others</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">Quiz & Assignment types will be aggregated based on course settings</p>
            </div>

            <div>
              <Label>Total Marks</Label>
              <Input
                type="number"
                required
                min="1"
                step="0.01"
                value={examFormData.totalMarks}
                onChange={(e) => setExamFormData({ ...examFormData, totalMarks: e.target.value })}
                placeholder="e.g., 100"
                className="mt-2"
              />
            </div>

            <div>
              <Label>
                Weightage (%)
                {(examFormData.examCategory === 'Quiz' || examFormData.examCategory === 'Assignment' || examFormData.examCategory === 'Project') && (
                  <span className="ml-2 text-xs text-amber-500">(Set in Course Settings)</span>
                )}
              </Label>
              {(examFormData.examCategory === 'Quiz' || examFormData.examCategory === 'Assignment' || examFormData.examCategory === 'Project') ? (
                <div className="mt-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground flex items-center justify-between">
                  <span>
                    {examFormData.examCategory === 'Project'
                      ? `${course?.projectWeightage ?? 25}% (shared across all projects)`
                      : `${(getInheritedExamWeightage(examFormData.examCategory) ?? 0).toFixed(2)}% from course settings`
                    }
                  </span>
                  <span className="text-xs text-amber-400 font-medium">Change in Course Settings →</span>
                </div>
              ) : (
                <Input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={examFormData.weightage}
                  onChange={(e) => setExamFormData({ ...examFormData, weightage: e.target.value })}
                  placeholder="e.g., 20"
                  className="mt-2"
                />
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {(examFormData.examCategory === 'Quiz' || examFormData.examCategory === 'Assignment')
                  ? 'Each item contributes using this shared group weight'
                  : examFormData.examCategory === 'Project'
                  ? course?.courseType === 'Lab' ? 'All OEL/CE marks are summed and scaled to the OEL/CE weightage' : 'All project marks are summed and scaled to the project weightage'
                  : 'Percentage contribution to final grade'}
              </p>
            </div>

            {course?.courseType === 'Theory' && examFormData.examCategory !== 'Project' && (
              <div>
                <Label>Track Course Outcomes (CO)?</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!examFormData.numberOfCOs || examFormData.numberOfCOs === '0' ? 'default' : 'outline'}
                    onClick={() => setExamFormData({ ...examFormData, numberOfCOs: '0' })}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={examFormData.numberOfCOs && examFormData.numberOfCOs !== '0' ? 'default' : 'outline'}
                    onClick={() => setExamFormData({ ...examFormData, numberOfCOs: examFormData.numberOfCOs && examFormData.numberOfCOs !== '0' ? examFormData.numberOfCOs : '6' })}
                  >
                    Yes
                  </Button>
                </div>
                {examFormData.numberOfCOs && examFormData.numberOfCOs !== '0' && (
                  <Input
                    type="number"
                    min="1"
                    max="6"
                    value={examFormData.numberOfCOs}
                    onChange={(e) => setExamFormData({ ...examFormData, numberOfCOs: e.target.value })}
                    placeholder="e.g., 6"
                    className="mt-2"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1">Quizzes and assignments usually don&apos;t track COs — turn this on only if this exam has a CO-wise marks breakdown</p>
              </div>
            )}
            {examFormData.examCategory === 'Project' && (
              <p className="text-xs text-muted-foreground -mt-2">
                💡 Project COs are configured once for the whole {course?.courseType === 'Lab' ? 'OEL/CE' : 'project'} group — use the gear icon on the {course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'} section header in the Exams tab.
              </p>
            )}

            <div>
              <Label>Number of Questions (Optional)</Label>
              <Input
                type="number"
                min="0"
                max="50"
                value={examFormData.numberOfQuestions}
                onChange={(e) => setExamFormData({ ...examFormData, numberOfQuestions: e.target.value })}
                placeholder="e.g., 5 (leave blank if not needed)"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">For question-wise marks breakdown (usually for MainExam category)</p>
            </div>

            {examFormData.examCategory === 'Project' && (
              <div>
                <Label>Rubric</Label>
                <select
                  value={examFormData.rubricTemplateId}
                  onChange={(e) => setExamFormData({ ...examFormData, rubricTemplateId: e.target.value })}
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
                >
                  <option value="">No rubric (direct marks)</option>
                  {rubricTemplates.map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a rubric to score this section 0–3 per criterion in the Project tab, or leave blank to enter a single mark per group directly.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowExamModal(false);
                  setError('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                Create Exam
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Configure Quiz / Assignment(CLA) / Project group settings */}
      <Dialog open={!!categoryConfigDialog} onOpenChange={(open) => !open && setCategoryConfigDialog(null)}>
        <DialogContent className={displayedCategoryConfig === 'Project' ? 'max-w-lg' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle>
              Configure {displayedCategoryConfig === 'Assignment' && course?.courseType === 'Lab'
                ? 'CLA'
                : displayedCategoryConfig === 'Project' && course?.courseType === 'Lab'
                ? 'OEL / CE Project'
                : displayedCategoryConfig} Settings
            </DialogTitle>
            <DialogDescription>
              {categoryConfigDialog?.thenOpenAddExam
                ? 'Set the total weightage and aggregation method for this group before adding your first item.'
                : 'Update the total weightage and aggregation method for this group.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCategoryConfig} className="space-y-4">
            <div>
              <Label>Total Weightage (%)</Label>
              <Input
                type="number"
                required
                min="0.01"
                max="100"
                step="0.01"
                value={categoryConfigForm.weightage}
                onChange={(e) => setCategoryConfigForm({ ...categoryConfigForm, weightage: e.target.value })}
                placeholder="e.g., 15"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shared across all {displayedCategoryConfig === 'Project' ? 'items in this group (summed)' : 'items in this group'}.
              </p>
            </div>

            {displayedCategoryConfig !== 'Project' && (
              <div>
                <Label>Aggregation Method</Label>
                <select
                  value={categoryConfigForm.aggregation}
                  onChange={(e) => setCategoryConfigForm({ ...categoryConfigForm, aggregation: e.target.value as 'average' | 'best' | 'sum' })}
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
                >
                  <option value="average">Average of all items</option>
                  {displayedCategoryConfig === 'Quiz' && <option value="best">Best item only</option>}
                  {displayedCategoryConfig === 'Assignment' && course?.courseType === 'Lab' && (
                    <option value="sum">Sum of all items</option>
                  )}
                  {displayedCategoryConfig === 'Assignment' && course?.courseType !== 'Lab' && (
                    <option value="best">Best item only</option>
                  )}
                </select>
              </div>
            )}

            {displayedCategoryConfig === 'Project' && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div>
                  <Label>Combined Course Outcomes</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Shared across every {course?.courseType === 'Lab' ? 'OEL/CE' : 'project'} exam — enter combined CO scores per group in the Project tab.
                  </p>
                </div>

                {(() => {
                  const projectExamsTotalMarks = exams.filter(e => e.examCategory === 'Project').reduce((sum, e) => sum + (Number(e.totalMarks) || 0), 0);
                  const target = getProjectCoTarget(projectCoForm.mode);
                  const targetUnit = projectCoForm.mode === 'marks' ? 'marks' : '%';
                  return (
                    <>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs">Distribute based on</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-muted-foreground hover:text-foreground">
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                <p className="mb-1"><strong>Marks:</strong> CO max marks add up to the raw total marks of every {course?.courseType === 'Lab' ? 'OEL/CE' : 'project'} exam ({projectExamsTotalMarks} marks here). Matches what teachers actually enter per group.</p>
                                <p><strong>Weightage:</strong> CO max marks add up to the {(parseFloat(categoryConfigForm.weightage) || 0).toFixed(2)}% weightage typed above instead — the older behavior, for courses that prefer to work in percentages.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex gap-2 mt-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={projectCoForm.mode === 'marks' ? 'default' : 'outline'}
                            onClick={() => handleProjectCoModeChange('marks')}
                          >
                            Marks
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={projectCoForm.mode === 'weightage' ? 'default' : 'outline'}
                            onClick={() => handleProjectCoModeChange('weightage')}
                          >
                            Weightage
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Number of COs</Label>
                        <Input
                          type="number"
                          min="0"
                          max="6"
                          value={projectCoForm.numberOfCOs}
                          onChange={(e) => handleProjectCoNumberChange(e.target.value)}
                          placeholder="e.g., 4"
                          className="mt-1"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={projectCoForm.autoDistribute}
                          onChange={(e) => handleProjectCoAutoDistributeToggle(e.target.checked)}
                        />
                        Auto-distribute the {targetUnit === 'marks' ? 'total marks' : 'weightage'} evenly across COs
                      </label>

                      {(parseInt(projectCoForm.numberOfCOs) || 0) > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: parseInt(projectCoForm.numberOfCOs) || 0 }).map((_, i) => (
                            <div key={i}>
                              <Label className="text-[10px] text-muted-foreground">CO {i + 1}</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                disabled={projectCoForm.autoDistribute}
                                value={projectCoForm.maxMarks[i] || ''}
                                onChange={(e) => handleProjectCoMaxMarkChange(i, e.target.value)}
                                placeholder="0"
                                className="mt-1 h-8 text-center"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {(parseInt(projectCoForm.numberOfCOs) || 0) > 0 && (
                        <p className={`text-xs ${
                          Math.round(projectCoForm.maxMarks.slice(0, parseInt(projectCoForm.numberOfCOs) || 0).reduce((s, m) => s + m, 0) * 100) / 100
                            === Math.round(target * 100) / 100
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          Total: {projectCoForm.maxMarks.slice(0, parseInt(projectCoForm.numberOfCOs) || 0).reduce((s, m) => s + m, 0).toFixed(2)} / {target.toFixed(2)} {targetUnit}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryConfigDialog(null)} disabled={savingCategoryConfig}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingCategoryConfig}>
                {savingCategoryConfig ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Mark Modal - New Component */}
      <AddMarkModal
        isOpen={showMarkModal}
        onClose={() => {
          setShowMarkModal(false);
          setInitialExamId(undefined);
          setInitialStudentId(undefined);
        }}
        students={students}
        exams={exams}
        marks={marks}
        courseId={courseId}
        onMarkSaved={fetchCourseData}
        initialExamId={initialExamId}
        initialStudentId={initialStudentId}
        coPoMaxMarks={course?.coPoMapping?.maxMarks || {}}
        onGoToCoPo={() => { setShowMarkModal(false); setActiveView('copo'); }}
        ignoredCoWarnings={ignoredCoWarnings}
        onIgnoreCOWarning={handleIgnoreCOWarning}
      />

      {/* Bulk Mark Entry Modal */}
      <BulkMarkEntryModal
        isOpen={showBulkMarkModal}
        onClose={() => {
          setShowBulkMarkModal(false);
          setBulkMarkInitialExamId(undefined);
        }}
        students={students}
        exams={exams}
        marks={marks}
        courseId={courseId}
        onMarksSaved={fetchCourseData}
        initialExamId={bulkMarkInitialExamId}
        coPoMaxMarks={course?.coPoMapping?.maxMarks || {}}
        onGoToCoPo={() => { setShowBulkMarkModal(false); setActiveView('copo'); }}
        ignoredCoWarnings={ignoredCoWarnings}
        onIgnoreCOWarning={handleIgnoreCOWarning}
        onShowScaleMarksModal={(examId) => {
          setScaleMarksExamId(examId);
          setScaleMarksInitialFrom(undefined);
        }}
      />

      {/* Bulk Paste Mark Modal */}
      <BulkPasteMarkModal
        isOpen={showBulkPasteModal}
        onClose={() => setShowBulkPasteModal(false)}
        students={students}
        exams={exams}
        marks={marks}
        courseId={courseId}
        onMarksSaved={fetchCourseData}
        coPoMaxMarks={course?.coPoMapping?.maxMarks || {}}
      />

      {/* Dictation Mark Modal */}
      <DictationMarkModal
        isOpen={showDictationModal}
        onClose={() => setShowDictationModal(false)}
        students={students}
        exams={exams}
        marks={marks}
        courseId={courseId}
        onMarkSaved={fetchCourseData}
      />

      {/* Exam Settings Modal */}
      <Dialog open={!!showExamSettings} onOpenChange={(open) => !open && setShowExamSettings(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exam Settings</DialogTitle>
          </DialogHeader>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <Label>Display Name</Label>
              <Input
                type="text"
                value={examSettings.displayName}
                onChange={(e) => setExamSettings({ ...examSettings, displayName: e.target.value })}
                placeholder="Exam name"
                className="mt-2"
              />
            </div>

            <div>
              <Label>Exam Category</Label>
              <select
                required
                value={examSettings.examCategory}
                onChange={(e) => setExamSettings({ ...examSettings, examCategory: e.target.value })}
                className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
              >
                {!examSettings.examCategory && <option value="">Select category...</option>}
                <option value="Quiz">Quiz</option>
                <option value="Assignment">{course?.courseType === 'Lab' ? 'Continuous Lab Assessment (CLA)' : 'Assignment'}</option>
                <option value="Project">{course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'}</option>
                <option value="Attendance">Attendance</option>
                <option value="MainExam">Main Exam</option>
                <option value="ClassPerformance">Class Performance</option>
                <option value="Others">Others</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">Quiz & Assignment types will be aggregated</p>
            </div>

            <div>
              <Label>Total Marks</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={examSettings.totalMarks}
                onChange={(e) => setExamSettings({ ...examSettings, totalMarks: e.target.value })}
                placeholder="e.g., 100"
                className="mt-2"
              />
            </div>

            <div>
              <Label>
                Weightage (%)
                {(examSettings.examCategory === 'Quiz' || examSettings.examCategory === 'Assignment' || examSettings.examCategory === 'Project') && (
                  <span className="ml-2 text-xs text-amber-500">(Set in Course Settings)</span>
                )}
              </Label>
              {(examSettings.examCategory === 'Quiz' || examSettings.examCategory === 'Assignment' || examSettings.examCategory === 'Project') ? (
                <div className="w-full px-4 py-3 bg-muted/50 border rounded-lg text-muted-foreground mt-2 flex items-center justify-between">
                  <span>
                    {examSettings.examCategory === 'Project'
                      ? `${course?.projectWeightage ?? 25}% shared across all projects`
                      : 'Not applicable — weightage set at course level'}
                  </span>
                  <span className="text-xs text-amber-400 font-medium">Change in Course Settings →</span>
                </div>
              ) : (
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={examSettings.weightage}
                  onChange={(e) => setExamSettings({ ...examSettings, weightage: e.target.value })}
                  placeholder="e.g., 30"
                  className="mt-2"
                />
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {(examSettings.examCategory === 'Quiz' || examSettings.examCategory === 'Assignment')
                  ? '💡 Use Course Settings to configure Quiz/Assignment aggregation weightage'
                  : examSettings.examCategory === 'Project'
                  ? course?.courseType === 'Lab' ? '💡 All OEL/CE marks are summed and scaled to the OEL/CE weightage in Course Settings' : '💡 All project marks are summed and scaled to the project weightage in Course Settings'
                  : 'Percentage contribution to final grade'}
              </p>
            </div>

            {canEditCOs && (
              <div>
                <Label>Track Course Outcomes (CO)?</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!examSettings.numberOfCOs || examSettings.numberOfCOs === '0' ? 'default' : 'outline'}
                    onClick={() => setExamSettings({ ...examSettings, numberOfCOs: '0' })}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={examSettings.numberOfCOs && examSettings.numberOfCOs !== '0' ? 'default' : 'outline'}
                    onClick={() => setExamSettings({ ...examSettings, numberOfCOs: examSettings.numberOfCOs && examSettings.numberOfCOs !== '0' ? examSettings.numberOfCOs : '6' })}
                  >
                    Yes
                  </Button>
                </div>
                {examSettings.numberOfCOs && examSettings.numberOfCOs !== '0' && (
                  <Input
                    type="number"
                    min="1"
                    max="6"
                    value={examSettings.numberOfCOs}
                    onChange={(e) => setExamSettings({ ...examSettings, numberOfCOs: e.target.value })}
                    placeholder="e.g., 6"
                    className="mt-2"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1">Quizzes and assignments usually don&apos;t track COs — turn this on only if this exam has a CO-wise marks breakdown</p>
              </div>
            )}

            <div>
              <Label>Number of Questions</Label>
              <Input
                type="number"
                min="0"
                max="50"
                value={examSettings.numberOfQuestions}
                onChange={(e) => setExamSettings({ ...examSettings, numberOfQuestions: e.target.value })}
                placeholder="e.g., 5 (leave blank if not needed)"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">For question-wise marks breakdown (usually for MainExam category)</p>
            </div>

            {examSettings.examCategory === 'Project' && (
              <div>
                <Label>Rubric</Label>
                <select
                  value={examSettings.rubricTemplateId}
                  onChange={(e) => setExamSettings({ ...examSettings, rubricTemplateId: e.target.value })}
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
                >
                  <option value="">No rubric (direct marks)</option>
                  {rubricTemplates.map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a rubric to score this section 0–3 per criterion in the Project tab, or leave blank to enter a single mark per group directly.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowExamSettings(null);
                  setError('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateExamSettings}>
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Course Settings Modal */}
      <Dialog open={showCourseSettings} onOpenChange={setShowCourseSettings}>
        <DialogContent className="max-w-7xl w-[96vw] h-[92vh] overflow-hidden p-0">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b bg-muted/40 px-6 py-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <span className="text-3xl">⚙️</span>
                  <span>Course Settings</span>
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  Configure grading, aggregation, and Excel export mapping.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              <aside className="hidden w-72 shrink-0 flex-col gap-2 border-r bg-muted/20 p-4 md:flex">
                <Button
                  type="button"
                  variant={courseSettingsTab === 'aggregation' ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setCourseSettingsTab('aggregation')}
                >
                  📊 Quiz & Assignment
                </Button>
                <Button
                  type="button"
                  variant={courseSettingsTab === 'grading' ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setCourseSettingsTab('grading')}
                >
                  🏆 Grading Scale
                </Button>
                <Button
                  type="button"
                  variant={courseSettingsTab === 'excelExport' ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setCourseSettingsTab('excelExport')}
                >
                  📄 Excel Export
                </Button>
                <Button
                  type="button"
                  variant={courseSettingsTab === 'alias' ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setCourseSettingsTab('alias')}
                >
                  🏷️ New Code
                </Button>
                <Button
                  type="button"
                  variant={courseSettingsTab === 'copo' ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setCourseSettingsTab('copo')}
                >
                  🎯 CO-PO Mapping
                </Button>
              </aside>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 pb-32">
                <div className="mb-6 grid gap-2 md:hidden">
                  <Button
                    type="button"
                    variant={courseSettingsTab === 'aggregation' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setCourseSettingsTab('aggregation')}
                  >
                    📊 Quiz & Assignment
                  </Button>
                  <Button
                    type="button"
                    variant={courseSettingsTab === 'grading' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setCourseSettingsTab('grading')}
                  >
                    🏆 Grading Scale
                  </Button>
                  <Button
                    type="button"
                    variant={courseSettingsTab === 'excelExport' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setCourseSettingsTab('excelExport')}
                  >
                    📄 Excel Export
                  </Button>
                  <Button
                    type="button"
                    variant={courseSettingsTab === 'alias' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setCourseSettingsTab('alias')}
                  >
                    🏷️ New Code
                  </Button>
                  <Button
                    type="button"
                    variant={courseSettingsTab === 'copo' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setCourseSettingsTab('copo')}
                  >
                    🎯 CO-PO Mapping
                  </Button>
                </div>

                {/* Content */}
                <div className="min-h-0">
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSaveCourseSettings} className="space-y-6 max-w-7xl mx-auto">
                {/* Quiz & Assignment Settings Tab */}
                {courseSettingsTab === 'aggregation' && (
                  <div className="space-y-6">
                    {/* Quiz Settings */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          📝 Quiz Aggregation
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <Label>Aggregation Method</Label>
                            <select
                              value={courseSettingsData.quizAggregation}
                              onChange={(e) => setCourseSettingsData({ ...courseSettingsData, quizAggregation: e.target.value as 'average' | 'best' })}
                              className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
                            >
                              <option value="average">Average of all quizzes</option>
                              <option value="best">Best quiz score</option>
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">How to calculate the aggregated Quiz column</p>
                          </div>

                          <div>
                            <Label>Quiz Weightage (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={courseSettingsData.quizWeightage}
                              onChange={(e) => setCourseSettingsData({ ...courseSettingsData, quizWeightage: e.target.value })}
                              placeholder="e.g., 20"
                              className="mt-2"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Weightage for the aggregated Quiz column in final grade</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Assignment/Assessment Settings */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          📋 {course?.courseType === 'Lab' ? 'Assessment' : 'Assignment'} Aggregation
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <Label>Aggregation Method</Label>
                            <select
                              value={courseSettingsData.assignmentAggregation}
                              onChange={(e) => setCourseSettingsData({ ...courseSettingsData, assignmentAggregation: e.target.value as 'average' | 'best' | 'sum' })}
                              className="w-full px-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground mt-2"
                            >
                              {course?.courseType === 'Lab' ? (
                                <>
                                  <option value="average">Average of all assessments</option>
                                  <option value="sum">Sum of all assessments</option>
                                </>
                              ) : (
                                <>
                                  <option value="average">Average of all assignments</option>
                                  <option value="best">Best assignment score</option>
                                </>
                              )}
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">
                              {course?.courseType === 'Lab'
                                ? (courseSettingsData.assignmentAggregation === 'sum'
                                    ? 'Sums every scored assessment\'s marks and totals, then weights the combined percentage'
                                    : 'Averages the normalized percentage of every scored assessment')
                                : 'How to calculate the aggregated Assignment column'}
                            </p>
                          </div>

                          <div>
                            <Label>{course?.courseType === 'Lab' ? 'Continuous Lab Assessment (CLA)' : 'Assignment'} Weightage (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={courseSettingsData.assignmentWeightage}
                              onChange={(e) => setCourseSettingsData({ ...courseSettingsData, assignmentWeightage: e.target.value })}
                              placeholder="e.g., 15"
                              className="mt-2"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Weightage for the aggregated Assignment column in final grade</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Project Settings */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          🎓 Project Aggregation
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <Label>Aggregation Method</Label>
                            <div className="w-full px-4 py-2 bg-muted/40 border rounded-lg text-foreground mt-2 text-sm text-muted-foreground">
                              Sum of all project marks → converted to weightage
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              All Project exam marks are added up, then scaled to the weightage below. No average or best — everything counts.
                            </p>
                          </div>
                          <div>
                            <Label>{course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'} Weightage (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={courseSettingsData.projectWeightage}
                              onChange={(e) => setCourseSettingsData({ ...courseSettingsData, projectWeightage: e.target.value })}
                              placeholder="e.g., 25"
                              className="mt-2"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Weightage for the aggregated Project column in final grade</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Info Box */}
                    <Alert className="border-primary/50 bg-primary/10">
                      <AlertDescription className="text-sm">
                        💡 <strong>Note:</strong> Individual Quiz/Assignment exams don't need weightages. 
                        The aggregated column will use the weightage you set here.
                        Project exams are summed (not averaged) before applying their weightage.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}


                {/* Grading Scale Tab */}
                {courseSettingsTab === 'grading' && (
                  <div className="space-y-6">
                    <Card>
                      <CardContent className="space-y-3 pt-6">
                        <div>
                          <Label>Show final grade to students?</Label>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Controls whether students see a computed final grade/letter grade when they check their
                            marks. Individual exam marks are always visible — this only hides the running final total,
                            useful mid-semester before all grading is finalized.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={!courseSettingsData.showFinalGrade ? 'default' : 'outline'}
                            onClick={() => setCourseSettingsData({ ...courseSettingsData, showFinalGrade: false })}
                          >
                            No
                          </Button>
                          <Button
                            type="button"
                            variant={courseSettingsData.showFinalGrade ? 'default' : 'outline'}
                            onClick={() => setCourseSettingsData({ ...courseSettingsData, showFinalGrade: true })}
                          >
                            Yes
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-semibold flex items-center gap-3">
                        <span className="text-3xl">📊</span>
                        <span>Grading Scale Management</span>
                      </h3>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setCourseSettingsData({ ...courseSettingsData, gradingScale: DEFAULT_GRADING_SCALE });
                        }}
                      >
                        🔄 Reset to Default
                      </Button>
                    </div>

                    <Card>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-3 font-semibold">Grade</th>
                                <th className="text-left py-2 px-3 font-semibold">Minimum %</th>
                                <th className="text-left py-2 px-3 font-semibold">Range Preview</th>
                                <th className="text-right py-2 px-3 font-semibold">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {courseSettingsData.gradingScale
                                .sort((a, b) => b.threshold - a.threshold)
                                .map((grade, index) => {
                                  const nextGrade = courseSettingsData.gradingScale
                                    .sort((a, b) => b.threshold - a.threshold)[index + 1];
                                  const upperBound = nextGrade ? nextGrade.threshold - 0.01 : 100;
                                  
                                  return (
                                    <tr key={index} className="border-b hover:bg-muted/30">
                                      <td className="py-2 px-3">
                                        <Badge variant="outline" className={`${getGradeBgColor(grade.letter)} ${getGradeColor(grade.letter)}`}>
                                          {getGradeDisplay(grade.letter, grade.modifier)}
                                        </Badge>
                                      </td>
                                      <td className="py-2 px-3">
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="0.01"
                                          value={grade.threshold}
                                          onChange={(e) => {
                                            const newThreshold = parseFloat(e.target.value);
                                            if (!isNaN(newThreshold)) {
                                              const updated = [...courseSettingsData.gradingScale];
                                              updated[courseSettingsData.gradingScale.indexOf(grade)] = {
                                                ...grade,
                                                threshold: newThreshold
                                              };
                                              setCourseSettingsData({ ...courseSettingsData, gradingScale: updated });
                                            }
                                          }}
                                          className="w-24"
                                        />
                                      </td>
                                      <td className="py-2 px-3 text-muted-foreground">
                                        {grade.threshold.toFixed(2)}% - {upperBound.toFixed(2)}%
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => {
                                            const updated = courseSettingsData.gradingScale.filter(g => g !== grade);
                                            setCourseSettingsData({ ...courseSettingsData, gradingScale: updated });
                                          }}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const newGrade: GradeThreshold = {
                                threshold: 0,
                                letter: 'F',
                                modifier: '0'
                              };
                              setCourseSettingsData({ 
                                ...courseSettingsData, 
                                gradingScale: [...courseSettingsData.gradingScale, newGrade].sort((a, b) => a.threshold - b.threshold)
                              });
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Grade Threshold
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Alert className="border-amber-500/50 bg-amber-500/10">
                      <AlertDescription className="text-sm">
                        ⚠️ <strong>Important:</strong> Grade thresholds define the minimum percentage needed for each letter grade. 
                        Ensure there are no overlaps or gaps between grades. The system validates automatically when you save.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

                {courseSettingsTab === 'excelExport' && (
                  <ExcelExportMappingInfo />
                )}

                {courseSettingsTab === 'alias' && (
                  <div className="max-w-2xl space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">New Code</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Turn this on if some students in this course (e.g. a newer admission batch) are officially
                        registered under a different course code (this also doubles as the course&apos;s UNESCO code
                        from the admin catalogue, when one was imported). You&apos;ll be able to choose which students
                        use it from the Students &amp; Marks tab, including an auto-categorize option.
                      </p>
                    </div>

                    {!courseCodeEditableByTeacher && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          The admin has locked this to whatever the course catalogue suggested. Contact your admin to change it.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label>Does this course have a New Code for some students?</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={!courseSettingsData.aliasEnabled ? 'default' : 'outline'}
                          disabled={!courseCodeEditableByTeacher}
                          onClick={() => setCourseSettingsData({ ...courseSettingsData, aliasEnabled: false, alternateCode: '' })}
                        >
                          No
                        </Button>
                        <Button
                          type="button"
                          variant={courseSettingsData.aliasEnabled ? 'default' : 'outline'}
                          disabled={!courseCodeEditableByTeacher}
                          onClick={() => setCourseSettingsData({ ...courseSettingsData, aliasEnabled: true })}
                        >
                          Yes
                        </Button>
                      </div>
                    </div>

                    {courseSettingsData.aliasEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="course-settings-alternate-code">New Code</Label>
                        <Input
                          id="course-settings-alternate-code"
                          value={courseSettingsData.alternateCode}
                          onChange={(e) => setCourseSettingsData({ ...courseSettingsData, alternateCode: e.target.value })}
                          placeholder="e.g., CSE470B"
                          disabled={!courseCodeEditableByTeacher}
                          className="max-w-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {courseSettingsTab === 'copo' && (
                  <div className="max-w-2xl space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">CO-PO Mapping</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Turn this off for courses that don&apos;t track Course Outcome &rarr; Program Outcome
                        attainment. When off, the CO-PO tab&apos;s warnings and the &quot;CO-PO matrix not set&quot;
                        notice on exports and the Marks tab are suppressed.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Does this course track CO-PO mapping?</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={courseSettingsData.coPoMappingEnabled ? 'default' : 'outline'}
                          onClick={() => setCourseSettingsData({ ...courseSettingsData, coPoMappingEnabled: true })}
                        >
                          Yes
                        </Button>
                        <Button
                          type="button"
                          variant={!courseSettingsData.coPoMappingEnabled ? 'default' : 'outline'}
                          onClick={() => setCourseSettingsData({ ...courseSettingsData, coPoMappingEnabled: false })}
                        >
                          No
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-8 border-t bg-background/95 px-0 py-4 backdrop-blur-md">
                  <div className="flex gap-4 max-w-7xl mx-auto">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowCourseSettings(false);
                        setError('');
                        setCourseSettingsTab('aggregation');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                    >
                      💾 Save All Settings
                    </Button>
                  </div>
                </div>
              </form>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Student Detail Modal */}
      <StudentDetailModal
        isOpen={showStudentDetail}
        onClose={() => {
          setShowStudentDetail(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
        exams={exams}
        marks={marks}
        course={course!}
      />

      {/* Grade Breakdown Modal */}
      <Dialog
        open={showGradeBreakdown && !!selectedStudentForGrade}
        onOpenChange={(open) => {
          if (!open) {
            setShowGradeBreakdown(false);
            setSelectedStudentForGrade(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedStudentForGrade && (
            <>
              <DialogHeader>
                <DialogTitle>Final Grade Breakdown</DialogTitle>
                <DialogDescription>
                  {selectedStudentForGrade.name} ({selectedStudentForGrade.studentId}) {selectedStudentForGrade.withdrawn && <span className="text-red-600 dark:text-red-400 font-bold ml-2">(Withdrawn)</span>}
                </DialogDescription>
              </DialogHeader>

              {(() => {
                if (selectedStudentForGrade.withdrawn) {
                  return (
                    <div className="text-center py-12">
                      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                        <span className="text-4xl font-bold text-red-600 dark:text-red-400">W</span>
                      </div>
                      <h3 className="text-xl font-medium mb-2">Student is Withdrawn</h3>
                      <p className="text-muted-foreground">
                        This student&apos;s final grade is recorded as Withdrawn (W).
                      </p>
                    </div>
                  );
                }

                const gradeData = calculateFinalGrade(selectedStudentForGrade._id);

                if (gradeData.breakdown.length === 0) {
                  return (
                    <div className="text-center py-12 text-muted-foreground">
                      No marks available for final grade calculation
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Breakdown Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Exam / Assessment
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Mark Obtained
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Percentage
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Weightage
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Contribution
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {gradeData.breakdown.map((item, idx) => {
                            const percentage = (item.mark / item.totalMarks) * 100;
                            return (
                              <tr key={idx} className={`${idx % 2 === 0 ? 'bg-muted/20' : ''} ${item.isAggregated ? 'bg-amber-500/5' : ''}`}>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    {item.isAggregated && <span className="text-xs">📊</span>}
                                    <span className={item.isAggregated ? 'font-semibold' : ''}>
                                      {item.name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className="px-2 py-1 rounded font-medium text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300">
                                    {item.mark.toFixed(2)} / {item.totalMarks}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className="px-2 py-1 rounded font-medium text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300">
                                    {percentage.toFixed(2)}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className="px-2 py-1 rounded font-medium text-xs bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                                    {item.weightage}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className="px-2 py-1 rounded font-medium text-xs bg-green-500/10 text-green-700 dark:text-green-300">
                                    {item.contribution.toFixed(2)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-muted/70">
                          <tr>
                            <td colSpan={4} className="px-4 py-4 text-right text-sm font-semibold">
                              Final Grade (Estimated):
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span className="px-3 py-2 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500/15 to-emerald-500/15 text-green-700 dark:text-green-200 border border-green-500/30">
                                {gradeData.total.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Info Box */}
                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>💡 Calculation Formula:</strong> For each exam/assessment, contribution = (Mark/TotalMarks × 100) × Weightage ÷ 100
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        • Aggregated columns (Quiz/Assignment) use their configured weightage from Course Settings
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        • When scaling is enabled, scaled marks are used in calculations
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        • Final grade is the sum of all contributions
                      </p>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Course Modal */}
      <Dialog
        open={showImportCourseModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowImportCourseModal(false);
            setImportCourseFile(null);
            setError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>📥 Import Course Data</DialogTitle>
          </DialogHeader>

          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
              <strong>⚠️ Warning:</strong> This will replace all current data in this course!
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              • All students, exams, and marks will be replaced
              <br />
              • Course settings will be updated
              <br />
              • This action cannot be undone
              <br />
              • Make sure to export current data first if needed
            </p>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Select Course Backup File (.json)
            </label>
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImportCourseFile(file);
                }
              }}
              className="w-full px-4 py-3 bg-background border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
            />
            {importCourseFile && (
              <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                ✓ Selected: {importCourseFile.name}
              </p>
            )}
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>💡 Tip:</strong> Only import files that were exported from this system to ensure compatibility.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportCourseModal(false);
                setImportCourseFile(null);
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleImportCourse} disabled={!importCourseFile || importingCourse}>
              {importingCourse ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import Data'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div> {/* Close modals wrapper */}

    {/* Student Stats Modal */}
    <Dialog
      open={showStudentStatsModal && !!selectedStudentForStats}
      onOpenChange={(open) => !open && setShowStudentStatsModal(false)}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        {selectedStudentForStats && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pr-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl text-white">
                👨‍🎓
              </div>
              <div>
                <h2 className="text-2xl font-bold">{selectedStudentForStats.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">Student ID: {selectedStudentForStats.studentId}</p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                  {getStudentMarks(selectedStudentForStats._id).length} / {exams.length} exams completed
                </p>
              </div>
            </div>
          </div>

          {/* Exams Grid */}
          {exams.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-muted-foreground">No exams configured for this course yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exams.map((exam) => {
                const mark = marks.find(m => m.studentId === selectedStudentForStats._id && m.examId === exam._id);
                const stats = getClassStatsForExam(exam._id);
                
                return (
                  <div
                    key={exam._id}
                    className={`p-4 rounded-lg border transition-all ${
                      mark
                        ? 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:border-blue-500/50'
                        : 'border-border bg-muted/30 hover:border-muted-foreground/30'
                    }`}
                  >
                    {/* Exam Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-lg flex items-center gap-2">
                          {exam.displayName}
                        </h4>
                        {exam.examCategory && (
                          <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground flex-shrink-0">
                            {exam.examCategory}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>📝 Total: {exam.totalMarks} marks</span>
                        </div>
                        <div>⚖️ Weightage: {exam.weightage}%</div>
                      </div>
                    </div>

                    {mark ? (
                      <>
                        {/* Marks Display */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
                            <div className="text-xs text-muted-foreground mb-1">Raw</div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-300">
                              {mark.rawMark}
                            </div>
                            <div className="text-xs text-muted-foreground">/{exam.totalMarks}</div>
                          </div>

                          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                            <div className="text-xs text-muted-foreground mb-1">Weighted</div>
                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">
                              {(mark.weightedMark !== undefined && mark.weightedMark !== null
                                ? mark.weightedMark
                                : (mark.rawMark / exam.totalMarks) * exam.weightage
                              ).toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Performance Visualization */}
                        {stats && stats.count > 0 && (() => {
                          const studentMark = mark.rawMark;
                          const avgPercent = (stats.average / stats.highest) * 100;
                          const studentPercent = (studentMark / stats.highest) * 100;

                          return (
                            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                              <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                                <span>📊</span>
                                <span>Class Performance</span>
                                <span className="ml-auto text-muted-foreground">({stats.count} students)</span>
                              </div>

                              <div className="space-y-2">
                                {/* Highest */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-12">High</span>
                                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-green-600 to-green-400 flex items-center justify-end pr-2"
                                      style={{ width: '100%' }}
                                    >
                                      <span className="text-xs font-semibold text-white">{stats.highest.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Student */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-12 flex items-center gap-1">
                                    <span>👤</span>
                                    <span>This</span>
                                  </span>
                                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden border-2 border-blue-500">
                                    <div
                                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-end pr-2"
                                      style={{ width: `${studentPercent}%` }}
                                    >
                                      <span className="text-xs font-semibold text-white">{studentMark.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Average */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-12">Avg</span>
                                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-end pr-2"
                                      style={{ width: `${avgPercent}%` }}
                                    >
                                      <span className="text-xs font-semibold text-white">{stats.average.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Lowest */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-12">Low</span>
                                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-red-600 to-red-400 flex items-center justify-end pr-2"
                                      style={{ width: `${(stats.lowest / stats.highest) * 100}%` }}
                                    >
                                      <span className="text-xs font-semibold text-white">{stats.lowest.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Performance badge */}
                              <div className="mt-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                  studentMark >= stats.average
                                    ? 'bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30'
                                    : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30'
                                }`}>
                                  {studentMark >= stats.average ? '🎯 Above Average' : '📈 Below Average'}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground italic">
                        <div className="text-3xl mb-2">📝</div>
                        <div className="text-sm">Marks not recorded yet</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Final Grade Summary */}
          {course.showFinalGrade && getStudentMarks(selectedStudentForStats._id).length > 0 && (() => {
            const gradeData = calculateFinalGrade(selectedStudentForStats._id);
            const totalWeightage = calculateTotalWeightage();
            const studentMarksCount = getStudentMarks(selectedStudentForStats._id).length;
            
            return (
              <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30">
                <h4 className="text-lg font-semibold mb-3">📈 Final Grade</h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Exams Taken</div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-300">
                      {studentMarksCount} / {exams.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total Weightage</div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                      {totalWeightage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Points Earned</div>
                    <div className="text-xl font-bold text-purple-600 dark:text-purple-300">
                      {gradeData.total.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Current Grade</div>
                    <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-300">
                      {totalWeightage > 0
                        ? `${((gradeData.total / totalWeightage) * 100).toFixed(1)}%`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Letter Grade</div>
                    <div className="text-2xl font-bold">
                      {totalWeightage > 0 ? (() => {
                        const percentage = (gradeData.total / totalWeightage) * 100;
                        const letterGrade = calculateLetterGrade(percentage, course.gradingScale);
                        return (
                          <span className={`${getGradeColor(letterGrade.letter)}`}>
                            {getGradeDisplay(letterGrade.letter, letterGrade.modifier)}
                          </span>
                        );
                      })() : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Breakdown Details */}
                {gradeData.breakdown.length > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm font-medium text-muted-foreground mb-3">Grade Breakdown</div>
                    <div className="space-y-2">
                      {gradeData.breakdown.map((item: any, idx: number) => (
                        <div key={idx} className={`flex items-center justify-between text-xs p-2 rounded ${
                          item.isAggregated ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-muted/50'
                        }`}>
                          <div className="flex items-center gap-2">
                            {item.isAggregated && <span>📊</span>}
                            <span className="text-muted-foreground">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-blue-600 dark:text-blue-400">
                              {item.mark.toFixed(2)}/{item.totalMarks}
                            </span>
                            <span className="text-purple-600 dark:text-purple-400">
                              {((item.mark / item.totalMarks) * 100).toFixed(1)}%
                            </span>
                            <span className="text-muted-foreground">×</span>
                            <span className="text-cyan-600 dark:text-cyan-400">{item.weightage}%</span>
                            <span className="text-muted-foreground">=</span>
                            <span className="text-green-600 dark:text-green-400 font-semibold min-w-[3rem] text-right">
                              {item.contribution.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm p-2 bg-green-500/10 border border-green-500/30 rounded font-semibold mt-3">
                        <span>Total Contribution:</span>
                        <span className="text-green-600 dark:text-green-300 text-lg">{gradeData.total.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Estimated Grade Calculator */}
          {(() => {
            const estimate = calculateEstimatedGrade(selectedStudentForStats._id);
            if (!estimate) return null;

            return (
              <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span>🎯</span>
                  <span>Grade Estimator</span>
                </h4>

                <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-purple-500/10 rounded-lg">
                    <div className="text-xs text-muted-foreground">Current Progress</div>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-300">
                      {estimate.completedExams}/{estimate.totalExams}
                    </div>
                    <div className="text-xs text-muted-foreground">exams</div>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg">
                    <div className="text-xs text-muted-foreground">Current Points</div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-300">
                      {estimate.currentPoints.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">out of {estimate.completedWeightage}%</div>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-lg">
                    <div className="text-xs text-muted-foreground">Remaining Exams</div>
                    <div className="text-lg font-bold text-amber-600 dark:text-amber-300">
                      {estimate.remainingExams}
                    </div>
                    <div className="text-xs text-muted-foreground">exams</div>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-lg">
                    <div className="text-xs text-muted-foreground">Remaining Weight</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">
                      {estimate.remainingWeightage.toFixed(0)}%
                    </div>
                    <div className="text-xs text-muted-foreground">weightage</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground mb-3">
                    Average % needed in remaining exams to achieve:
                  </div>
                  {estimate.estimates.map((est: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        est.achievable
                          ? 'bg-muted/50 border-border'
                          : 'bg-red-500/10 border-red-500/30 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl font-bold ${
                            est.grade === 'A' ? 'text-green-600 dark:text-green-400' :
                            est.grade === 'B' ? 'text-blue-600 dark:text-blue-400' :
                            est.grade === 'C' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-orange-600 dark:text-orange-400'
                          }`}>
                            {est.grade}
                          </span>
                          <div>
                            <div className="text-sm">
                              Grade {est.grade} (≥{est.targetPercentage}%)
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Need {(est.targetPercentage - estimate.currentPoints).toFixed(1)} more points
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${
                            est.achievable ? 'text-cyan-600 dark:text-cyan-300' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {est.averageNeeded.toFixed(1)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {est.achievable ? 'avg needed' : 'not possible'}
                          </div>
                        </div>
                      </div>
                      {!est.achievable && (
                        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                          ⚠️ Target not achievable with remaining weightage
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <p className="text-xs text-cyan-700 dark:text-cyan-300">
                    <strong>💡 How to read:</strong> If this student scores the shown percentage (average) in all remaining exams,
                    they'll achieve that grade. For example, if "Grade B" shows "75%", scoring an average of 75%
                    in the remaining {estimate.remainingExams} exam(s) will result in a B grade overall.
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Set Empty Marks to Zero Modal */}
    <Dialog open={showSetZeroModal} onOpenChange={(open) => {
      if (!open) {
        setShowSetZeroModal(false);
        setSelectedExamsForAction([]);
        setConfirmationStep(0);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>0️⃣</span>
            Set Empty Marks to 0
          </DialogTitle>
          <DialogDescription>
            {confirmationStep === 0 && 'Select exams to set empty marks to 0. Empty marks will be created with value 0.'}
            {confirmationStep === 1 && 'Review your selection and confirm the action.'}
            {confirmationStep === 2 && 'FINAL CONFIRMATION: This action cannot be undone!'}
          </DialogDescription>
        </DialogHeader>

        {confirmationStep === 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-exams-zero"
                  checked={selectedExamsForAction.length === 0}
                  onCheckedChange={(checked) => {
                    setSelectedExamsForAction(checked ? [] : exams.map(e => e._id));
                  }}
                />
                <Label htmlFor="all-exams-zero" className="font-semibold cursor-pointer">
                  All Exams ({exams.length})
                </Label>
              </div>
              <Badge variant="secondary">{exams.length} exams</Badge>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Individual Exams:</div>
              {exams.map(exam => (
                <div key={exam._id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`exam-zero-${exam._id}`}
                      checked={selectedExamsForAction.length === 0 || selectedExamsForAction.includes(exam._id)}
                      disabled={selectedExamsForAction.length === 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedExamsForAction([...selectedExamsForAction, exam._id]);
                        } else {
                          setSelectedExamsForAction(selectedExamsForAction.filter(id => id !== exam._id));
                        }
                      }}
                    />
                    <Label htmlFor={`exam-zero-${exam._id}`} className="cursor-pointer">
                      {exam.displayName}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{exam.totalMarks} marks</span>
                    {exam.examCategory && (
                      <Badge variant="outline">{exam.examCategory}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {confirmationStep === 1 && (
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">You are about to set empty marks to 0 for:</p>
                <ul className="list-disc list-inside space-y-1">
                  {selectedExamsForAction.length === 0 ? (
                    <li>All {exams.length} exams</li>
                  ) : (
                    selectedExamsForAction.map(examId => {
                      const exam = exams.find(e => e._id === examId);
                      return exam ? <li key={examId}>{exam.displayName}</li> : null;
                    })
                  )}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                  This will create mark entries with value 0 for all students who don't have marks for these exams.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {confirmationStep === 2 && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-3">
                <p className="font-bold text-lg">⚠️ FINAL CONFIRMATION</p>
                <p>This is your last chance to cancel. Once you proceed, empty marks will be set to 0 for the selected exams.</p>
                <p className="text-sm">Type <strong>"CONFIRM"</strong> below to proceed:</p>
                <Input
                  id="final-confirm-zero"
                  placeholder="Type CONFIRM"
                  className="mt-2"
                />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex gap-2">
          {confirmationStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setConfirmationStep(confirmationStep - 1)}
            >
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setShowSetZeroModal(false);
              setSelectedExamsForAction([]);
              setConfirmationStep(0);
            }}
          >
            Cancel
          </Button>
          {confirmationStep < 2 && (
            <Button
              onClick={() => setConfirmationStep(confirmationStep + 1)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Next
            </Button>
          )}
          {confirmationStep === 2 && (
            <Button
              onClick={() => {
                const input = document.getElementById('final-confirm-zero') as HTMLInputElement;
                if (input?.value === 'CONFIRM') {
                  handleSetEmptyMarksToZero(selectedExamsForAction);
                } else {
                  alert('Please type CONFIRM to proceed');
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Set to Zero
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Set Column Mark Modal */}
    <Dialog open={showSetColumnMarkModal} onOpenChange={(open) => {
      if (!open) {
        setShowSetColumnMarkModal(false);
        setSetColumnMarkExamId(null);
        setColumnMarkValue('');
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🎯</span>
            Set All Marks
          </DialogTitle>
          <DialogDescription>
            {(() => {
              const exam = exams.find(e => e._id === setColumnMarkExamId);
              return exam
                ? `Set every student's mark for "${exam.displayName}" to the same value (out of ${exam.totalMarks}). This overwrites any existing marks for this exam.`
                : 'Set every student\'s mark for this exam to the same value.';
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="column-mark-value">Mark to apply</Label>
          <Input
            id="column-mark-value"
            type="number"
            min="0"
            max={exams.find(e => e._id === setColumnMarkExamId)?.totalMarks}
            step="0.1"
            value={columnMarkValue}
            onChange={(e) => setColumnMarkValue(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setShowSetColumnMarkModal(false);
              setSetColumnMarkExamId(null);
              setColumnMarkValue('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSetColumnMark}
            disabled={settingColumnMark || columnMarkValue === ''}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {settingColumnMark ? 'Applying...' : `Apply to All ${students.length} Students`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Marks Statistics Modal */}
    <MarksStatisticsModal
      isOpen={showMarksStatsModal}
      onClose={() => setShowMarksStatsModal(false)}
      students={students}
      exams={exams}
      marks={marks}
    />

    <ScaleMarksModal
      isOpen={!!scaleMarksExamId}
      onClose={() => { setScaleMarksExamId(null); setScaleMarksInitialFrom(undefined); }}
      exam={exams.find(e => e._id === scaleMarksExamId) || null}
      marks={marks}
      initialScaleFrom={scaleMarksInitialFrom}
      onScaled={fetchCourseData}
    />

    {/* Reset Marks Modal */}
    <Dialog open={showResetMarksModal} onOpenChange={(open) => {
      if (!open) {
        setShowResetMarksModal(false);
        setSelectedExamsForAction([]);
        setConfirmationStep(0);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Reset Marks (Delete)
          </DialogTitle>
          <DialogDescription>
            {confirmationStep === 0 && 'Select exams to reset. This will DELETE all marks for the selected exams.'}
            {confirmationStep === 1 && 'Review your selection and confirm the deletion.'}
            {confirmationStep === 2 && 'FINAL CONFIRMATION: This action PERMANENTLY deletes marks and CANNOT be undone!'}
          </DialogDescription>
        </DialogHeader>

        {confirmationStep === 0 && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                ⚠️ Warning: This will permanently delete all marks for the selected exams. This action cannot be undone!
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-exams-reset"
                  checked={selectedExamsForAction.length === 0}
                  onCheckedChange={(checked) => {
                    setSelectedExamsForAction(checked ? [] : exams.map(e => e._id));
                  }}
                />
                <Label htmlFor="all-exams-reset" className="font-semibold cursor-pointer">
                  All Exams ({exams.length})
                </Label>
              </div>
              <Badge variant="destructive">{exams.length} exams</Badge>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Individual Exams:</div>
              {exams.map(exam => {
                const examMarksCount = marks.filter(m => m.examId === exam._id).length;
                return (
                  <div key={exam._id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`exam-reset-${exam._id}`}
                        checked={selectedExamsForAction.length === 0 || selectedExamsForAction.includes(exam._id)}
                        disabled={selectedExamsForAction.length === 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedExamsForAction([...selectedExamsForAction, exam._id]);
                          } else {
                            setSelectedExamsForAction(selectedExamsForAction.filter(id => id !== exam._id));
                          }
                        }}
                      />
                      <Label htmlFor={`exam-reset-${exam._id}`} className="cursor-pointer">
                        {exam.displayName}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary">{examMarksCount} marks</Badge>
                      {exam.examCategory && (
                        <Badge variant="outline">{exam.examCategory}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {confirmationStep === 1 && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">⚠️ You are about to DELETE all marks for:</p>
                <ul className="list-disc list-inside space-y-1">
                  {selectedExamsForAction.length === 0 ? (
                    <li>All {exams.length} exams ({marks.length} total marks)</li>
                  ) : (
                    selectedExamsForAction.map(examId => {
                      const exam = exams.find(e => e._id === examId);
                      const count = marks.filter(m => m.examId === examId).length;
                      return exam ? <li key={examId}>{exam.displayName} ({count} marks)</li> : null;
                    })
                  )}
                </ul>
                <p className="mt-3 font-semibold">
                  Total marks to be deleted: {selectedExamsForAction.length === 0 
                    ? marks.length 
                    : marks.filter(m => selectedExamsForAction.includes(m.examId)).length}
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {confirmationStep === 2 && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-3">
                <p className="font-bold text-lg">🚨 FINAL CONFIRMATION</p>
                <p className="font-semibold">This action will PERMANENTLY DELETE marks and CANNOT be recovered!</p>
                <p className="text-sm">Type <strong>"DELETE"</strong> below to proceed:</p>
                <Input
                  id="final-confirm-reset"
                  placeholder="Type DELETE"
                  className="mt-2 border-red-500"
                />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex gap-2">
          {confirmationStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setConfirmationStep(confirmationStep - 1)}
            >
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setShowResetMarksModal(false);
              setSelectedExamsForAction([]);
              setConfirmationStep(0);
            }}
          >
            Cancel
          </Button>
          {confirmationStep < 2 && (
            <Button
              onClick={() => setConfirmationStep(confirmationStep + 1)}
              variant="destructive"
            >
              Next
            </Button>
          )}
          {confirmationStep === 2 && (
            <Button
              onClick={() => {
                const input = document.getElementById('final-confirm-reset') as HTMLInputElement;
                if (input?.value === 'DELETE') {
                  handleResetMarks(selectedExamsForAction);
                } else {
                  alert('Please type DELETE to proceed');
                }
              }}
              variant="destructive"
            >
              Delete Marks
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Individual Student Modal */}
    <Dialog open={showAddStudentModal} onOpenChange={setShowAddStudentModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Student
          </DialogTitle>
          <DialogDescription>
            Add a single student to the course
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="student-id">Student ID</Label>
            <Input
              id="student-id"
              value={newStudentData.studentId}
              onChange={(e) => setNewStudentData({ ...newStudentData, studentId: e.target.value })}
              placeholder="e.g., S001"
            />
          </div>
          <div>
            <Label htmlFor="student-name">Student Name</Label>
            <Input
              id="student-name"
              value={newStudentData.name}
              onChange={(e) => setNewStudentData({ ...newStudentData, name: e.target.value })}
              placeholder="e.g., John Doe"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowAddStudentModal(false);
              setNewStudentData({ studentId: '', name: '' });
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleAddIndividualStudent}>
            Add Student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit Student Modal */}
    <Dialog open={showEditStudentModal} onOpenChange={setShowEditStudentModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ✏️ Edit Student
          </DialogTitle>
          <DialogDescription>
            Update student ID and name
          </DialogDescription>
        </DialogHeader>

        {studentToEdit && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-student-id">Student ID</Label>
              <Input
                id="edit-student-id"
                value={editStudentData.studentId}
                onChange={(e) => setEditStudentData({ ...editStudentData, studentId: e.target.value })}
                placeholder="e.g., S001"
              />
            </div>
            <div>
              <Label htmlFor="edit-student-name">Student Name</Label>
              <Input
                id="edit-student-name"
                value={editStudentData.name}
                onChange={(e) => setEditStudentData({ ...editStudentData, name: e.target.value })}
                placeholder="e.g., John Doe"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowEditStudentModal(false);
              setStudentToEdit(null);
              setEditStudentData({ studentId: '', name: '' });
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleEditStudent}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>



    {/* Delete Student Modal with Double Confirmation */}
    <Dialog open={showDeleteStudentModal} onOpenChange={(open) => {
      if (!open) {
        setShowDeleteStudentModal(false);
        setStudentToDelete(null);
        setDeleteConfirmationStep(0);
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Delete Student
          </DialogTitle>
          <DialogDescription>
            {deleteConfirmationStep === 0 && 'Are you sure you want to delete this student?'}
            {deleteConfirmationStep === 1 && 'FINAL CONFIRMATION: This action cannot be undone!'}
          </DialogDescription>
        </DialogHeader>

        {studentToDelete && (
          <>
            {deleteConfirmationStep === 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">You are about to delete:</p>
                    <div className="p-3 bg-destructive/10 rounded-lg">
                      <p><strong>ID:</strong> {studentToDelete.studentId}</p>
                      <p><strong>Name:</strong> {studentToDelete.name}</p>
                    </div>
                    <p className="text-sm mt-3">
                      This will also delete all marks associated with this student.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {deleteConfirmationStep === 1 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="space-y-3">
                    <p className="font-bold text-lg">⚠️ FINAL CONFIRMATION</p>
                    <p>This will permanently delete <strong>{studentToDelete.name}</strong> and all their marks!</p>
                    <p className="text-sm">Type <strong>"DELETE"</strong> below to proceed:</p>
                    <Input
                      id="delete-student-confirm"
                      placeholder="Type DELETE"
                      className="mt-2 border-red-500"
                    />
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        <DialogFooter className="flex gap-2">
          {deleteConfirmationStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmationStep(0)}
            >
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setShowDeleteStudentModal(false);
              setStudentToDelete(null);
              setDeleteConfirmationStep(0);
            }}
          >
            Cancel
          </Button>
          {deleteConfirmationStep === 0 && (
            <Button
              onClick={() => setDeleteConfirmationStep(1)}
              variant="destructive"
            >
              Next
            </Button>
          )}
          {deleteConfirmationStep === 1 && (
            <Button
              onClick={() => {
                const input = document.getElementById('delete-student-confirm') as HTMLInputElement;
                if (input?.value === 'DELETE') {
                  handleDeleteStudent();
                } else {
                  alert('Please type DELETE to proceed');
                }
              }}
              variant="destructive"
            >
              Delete Student
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <PopulateTestDataModal
      isOpen={showPopulateModal}
      hasStudents={students.length > 0}
      onClose={() => setShowPopulateModal(false)}
      onConfirm={handlePopulateTestData}
    />
    </>
  );
}
