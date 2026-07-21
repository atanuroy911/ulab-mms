'use client';

import { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Trash2, 
  Upload, 
  Download, 
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  X,
  Eye,
  GraduationCap,
  Clock,
  FileText,
  List,
  Trash,
  RefreshCw,
  Library
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
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import RichTextEditor from '@/app/components/RichTextEditor';
import { notify } from '@/app/utils/notifications';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface AdminCourse {
  _id: string;
  courseCode: string;
  courseTitle: string;
  creditHour: number;
  prerequisite?: string;
  content?: string;
  unescoCode?: string;
  majors?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface ImportResult {
  updated: number;
  created: number;
  errors: Array<{ row: number; error: string; data: any }>;
  details: {
    updated: Array<{ courseCode: string; courseTitle: string }>;
    created: Array<{ courseCode: string; courseTitle: string }>;
  };
}

interface FixedProgram {
  id: string;
  name: string;
  short: string;
  icon: string;
}

interface RegistryDiffEntry {
  code: string;
  unescoCode: string;
  title: string;
  status: 'new' | 'changed' | 'unchanged';
  existing?: { courseTitle: string; unescoCode: string };
}

export default function CourseManagement() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportResultModal, setShowImportResultModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AdminCourse | null>(null);
  const [viewingCourse, setViewingCourse] = useState<AdminCourse | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'update'>('update');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [formData, setFormData] = useState({
    courseCode: '',
    courseTitle: '',
    creditHour: '',
    prerequisite: 'N/A',
    content: '',
    unescoCode: '',
    majors: [] as string[],
  });
  const [fixedPrograms, setFixedPrograms] = useState<FixedProgram[]>([]);
  const [showRegistryModal, setShowRegistryModal] = useState(false);
  const [registryMajor, setRegistryMajor] = useState('');
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryAvailable, setRegistryAvailable] = useState(true);
  const [registryEntries, setRegistryEntries] = useState<RegistryDiffEntry[]>([]);
  const [selectedRegistryCodes, setSelectedRegistryCodes] = useState<Set<string>>(new Set());
  const [registryImporting, setRegistryImporting] = useState(false);

  useEffect(() => {
    fetchCourses();
    fetchFixedPrograms();
  }, []);

  const fetchFixedPrograms = async () => {
    try {
      const response = await fetch('/api/admin/courses/registry');
      const data = await response.json();
      if (response.ok) {
        setFixedPrograms(data.programs || []);
      }
    } catch (error) {
      console.error('Fetch fixed programs error:', error);
    }
  };

  const fetchRegistryDiff = async (major: string) => {
    setRegistryLoading(true);
    setRegistryEntries([]);
    setSelectedRegistryCodes(new Set());
    try {
      const response = await fetch(`/api/admin/courses/registry?major=${encodeURIComponent(major)}`);
      const data = await response.json();
      if (response.ok) {
        setRegistryAvailable(data.available !== false);
        const entries: RegistryDiffEntry[] = data.entries || [];
        setRegistryEntries(entries);
        setSelectedRegistryCodes(new Set(entries.filter(e => e.status !== 'unchanged').map(e => e.code)));
      } else {
        toast.error(data.error || 'Failed to load fixed registry');
      }
    } catch (error) {
      console.error('Fetch registry diff error:', error);
      toast.error('Failed to load fixed registry');
    } finally {
      setRegistryLoading(false);
    }
  };

  const toggleRegistryCode = (code: string) => {
    setSelectedRegistryCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleRegistryImport = async () => {
    if (selectedRegistryCodes.size === 0) {
      toast.error('Select at least one course to import');
      return;
    }

    setRegistryImporting(true);
    try {
      const response = await fetch('/api/admin/courses/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ major: registryMajor, codes: Array.from(selectedRegistryCodes) }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Imported from ${registryMajor}: ${data.created} created, ${data.updated} updated`);
        fetchCourses();
        fetchRegistryDiff(registryMajor);
      } else {
        toast.error(data.error || 'Failed to import from registry');
      }
    } catch (error) {
      console.error('Registry import error:', error);
      toast.error('Failed to import from registry');
    } finally {
      setRegistryImporting(false);
    }
  };

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/courses');
      const data = await response.json();
      
      if (response.ok) {
        setCourses(data.courses || []);
      } else {
        toast.error('Failed to load courses');
      }
    } catch (error) {
      console.error('Fetch courses error:', error);
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.courseCode || !formData.courseTitle || !formData.creditHour) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Course added successfully');
        setShowAddModal(false);
        resetForm();
        fetchCourses();
      } else if (response.status === 409) {
        toast.error('Course code already exists');
      } else {
        toast.error(data.error || 'Failed to add course');
      }
    } catch (error) {
      console.error('Add course error:', error);
      toast.error('Failed to add course');
    }
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingCourse || !formData.courseCode || !formData.courseTitle || !formData.creditHour) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const response = await fetch('/api/admin/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingCourse._id,
          ...formData,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Course updated successfully');
        setShowEditModal(false);
        setEditingCourse(null);
        resetForm();
        fetchCourses();
      } else if (response.status === 409) {
        toast.error('Course code already exists');
      } else {
        toast.error(data.error || 'Failed to update course');
      }
    } catch (error) {
      console.error('Update course error:', error);
      toast.error('Failed to update course');
    }
  };

  const handleDeleteCourse = async (courseId: string, courseCode: string) => {
    if (!confirm(`Are you sure you want to delete course "${courseCode}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/courses?id=${courseId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Course deleted successfully');
        fetchCourses();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete course');
      }
    } catch (error) {
      console.error('Delete course error:', error);
      toast.error('Failed to delete course');
    }
  };

  const handleDeleteAllCourses = async () => {
    if (deleteAllConfirmText !== 'DELETE ALL') {
      toast.error('Please type "DELETE ALL" to confirm');
      return;
    }

    setDeletingAll(true);
    try {
      const response = await fetch('/api/admin/courses/delete-all', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Successfully deleted ${data.count} courses`);
        setShowDeleteAllModal(false);
        setDeleteAllConfirmText('');
        fetchCourses();
      } else {
        toast.error(data.error || 'Failed to delete courses');
      }
    } catch (error) {
      console.error('Delete all courses error:', error);
      toast.error('Failed to delete courses');
    } finally {
      setDeletingAll(false);
    }
  };

  const openEditModal = (course: AdminCourse) => {
    setEditingCourse(course);
    setFormData({
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      creditHour: course.creditHour.toString(),
      prerequisite: course.prerequisite || 'N/A',
      content: course.content || '',
      unescoCode: course.unescoCode || '',
      majors: course.majors || [],
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      courseCode: '',
      courseTitle: '',
      creditHour: '',
      prerequisite: 'N/A',
      content: '',
      unescoCode: '',
      majors: [],
    });
  };

  const toggleFormMajor = (majorId: string) => {
    setFormData(prev => ({
      ...prev,
      majors: prev.majors.includes(majorId)
        ? prev.majors.filter(m => m !== majorId)
        : [...prev.majors, majorId],
    }));
  };

  const handleExportCSV = () => {
    if (courses.length === 0) {
      toast.error('No courses to export');
      return;
    }

    const exportData = courses.map(course => ({
      'Course Code': course.courseCode,
      'Course Title': course.courseTitle,
      'Credit Hour': course.creditHour,
      'Prerequisite': course.prerequisite || 'N/A',
      'Content': course.content || '',
      'UNESCO/New Code': course.unescoCode || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Courses');
    XLSX.writeFile(wb, `courses_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Courses exported successfully');
  };

  const handleExportTemplate = () => {
    let exportData;

    if (courses.length === 0) {
      // Empty template
      exportData = [{
        'Course Code': '',
        'Course Title': '',
        'Credit Hour': '',
        'Prerequisite': '',
        'Content': '',
        'UNESCO/New Code': '',
      }];
    } else {
      // Template with existing courses
      exportData = courses.map(course => ({
        'Course Code': course.courseCode,
        'Course Title': course.courseTitle,
        'Credit Hour': course.creditHour,
        'Prerequisite': course.prerequisite || 'N/A',
        'Content': course.content || '',
        'UNESCO/New Code': course.unescoCode || '',
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Courses');
    XLSX.writeFile(wb, `course_template_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    if (courses.length === 0) {
      toast.success('Empty template downloaded');
    } else {
      toast.success('Template with existing courses downloaded');
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    try {
      setImporting(true);
      
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Transform data to match API format
      const coursesToImport = jsonData.map((row: any) => ({
        courseCode: row['Course Code']?.toString().trim() || '',
        courseTitle: row['Course Title']?.toString().trim() || '',
        creditHour: parseFloat(row['Credit Hour']) || 0,
        prerequisite: row['Prerequisite']?.toString().trim() || 'N/A',
        content: row['Content']?.toString().trim() || '',
        unescoCode: row['UNESCO/New Code']?.toString().trim() || '',
      }));

      // Send to API
      const response = await fetch('/api/admin/courses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courses: coursesToImport,
          mode: importMode,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setImportResult(result.result);
        setShowImportModal(false);
        setShowImportResultModal(true);
        fetchCourses();
        
        const { created, updated, errors } = result.result;
        if (errors.length === 0) {
          toast.success(`Import successful: ${created} created, ${updated} updated`);
        } else {
          toast.warning(`Import completed with ${errors.length} errors`);
        }
      } else {
        toast.error(result.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import courses');
    } finally {
      setImporting(false);
      setImportFile(null);
    }
  };

  const filteredCourses = courses.filter(course =>
    course.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.courseTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Course Management</h2>
          <p className="text-muted-foreground">Manage global course catalogue</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="destructive" 
            onClick={() => setShowDeleteAllModal(true)}
            disabled={courses.length === 0}
          >
            <Trash className="h-4 w-4 mr-2" />
            Delete All
          </Button>
          <Button variant="outline" onClick={handleExportTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={courses.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowRegistryModal(true);
              if (registryMajor) fetchRegistryDiff(registryMajor);
            }}
          >
            <Library className="h-4 w-4 mr-2" />
            Import from Fixed Registry
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Course
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Badge variant="secondary">
          {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'}
        </Badge>
      </div>

      {/* Courses Table */}
      {filteredCourses.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">
              {courses.length === 0 ? 'No courses yet' : 'No matching courses'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {courses.length === 0 
                ? 'Add your first course or import from a CSV/Excel file'
                : 'Try adjusting your search query'}
            </p>
            {courses.length === 0 && (
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Course
                </Button>
                <Button variant="outline" onClick={() => setShowImportModal(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course Code</TableHead>
                <TableHead>UNESCO/New Code</TableHead>
                <TableHead>Course Title</TableHead>
                <TableHead>Credit Hour</TableHead>
                <TableHead>Prerequisite</TableHead>
                <TableHead>Majors</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCourses.map((course) => (
                <TableRow key={course._id}>
                  <TableCell className="font-mono font-semibold">{course.courseCode}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{course.unescoCode || 'N/A'}</TableCell>
                  <TableCell>{course.courseTitle}</TableCell>
                  <TableCell>{course.creditHour}</TableCell>
                  <TableCell className="text-muted-foreground">{course.prerequisite || 'N/A'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(course.majors || []).map((m) => (
                        <Badge key={m} variant="outline">{m}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setViewingCourse(course);
                          setShowViewModal(true);
                        }}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(course)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCourse(course._id, course.courseCode)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Course Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Course</DialogTitle>
            <DialogDescription>
              Add a new course to the global catalogue
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddCourse} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-courseCode">
                  Course Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-courseCode"
                  value={formData.courseCode}
                  onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                  placeholder="e.g., MAT1101"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-creditHour">
                  Credit Hour <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-creditHour"
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={formData.creditHour}
                  onChange={(e) => setFormData({ ...formData, creditHour: e.target.value })}
                  placeholder="e.g., 3.00"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-courseTitle">
                Course Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-courseTitle"
                value={formData.courseTitle}
                onChange={(e) => setFormData({ ...formData, courseTitle: e.target.value })}
                placeholder="e.g., Differential and Integral Calculus"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-prerequisite">Prerequisite</Label>
                <Input
                  id="add-prerequisite"
                  value={formData.prerequisite}
                  onChange={(e) => setFormData({ ...formData, prerequisite: e.target.value })}
                  placeholder="e.g., N/A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-unescoCode">UNESCO/New Code</Label>
                <Input
                  id="add-unescoCode"
                  value={formData.unescoCode}
                  onChange={(e) => setFormData({ ...formData, unescoCode: e.target.value })}
                  placeholder="e.g., 0613-014-1201"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Majors</Label>
              <div className="flex flex-wrap gap-2">
                {fixedPrograms.map((p) => (
                  <Badge
                    key={p.id}
                    variant={formData.majors.includes(p.id) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleFormMajor(p.id)}
                  >
                    {p.icon} {p.short}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-content">Content / Description</Label>
              <RichTextEditor
                value={formData.content}
                onChange={(value) => setFormData({ ...formData, content: value })}
                placeholder="Enter course content, syllabus, textbooks, etc..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Add Course</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Course Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
            <DialogDescription>
              Update course information
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditCourse} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-courseCode">
                  Course Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-courseCode"
                  value={formData.courseCode}
                  onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                  placeholder="e.g., MAT1101"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-creditHour">
                  Credit Hour <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-creditHour"
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={formData.creditHour}
                  onChange={(e) => setFormData({ ...formData, creditHour: e.target.value })}
                  placeholder="e.g., 3.00"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-courseTitle">
                Course Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-courseTitle"
                value={formData.courseTitle}
                onChange={(e) => setFormData({ ...formData, courseTitle: e.target.value })}
                placeholder="e.g., Differential and Integral Calculus"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-prerequisite">Prerequisite</Label>
                <Input
                  id="edit-prerequisite"
                  value={formData.prerequisite}
                  onChange={(e) => setFormData({ ...formData, prerequisite: e.target.value })}
                  placeholder="e.g., N/A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unescoCode">UNESCO/New Code</Label>
                <Input
                  id="edit-unescoCode"
                  value={formData.unescoCode}
                  onChange={(e) => setFormData({ ...formData, unescoCode: e.target.value })}
                  placeholder="e.g., 0613-014-1201"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Majors</Label>
              <div className="flex flex-wrap gap-2">
                {fixedPrograms.map((p) => (
                  <Badge
                    key={p.id}
                    variant={formData.majors.includes(p.id) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleFormMajor(p.id)}
                  >
                    {p.icon} {p.short}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">Content / Description</Label>
              <RichTextEditor
                value={formData.content}
                onChange={(value) => setFormData({ ...formData, content: value })}
                placeholder="Enter course content, syllabus, textbooks, etc..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingCourse(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Courses</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file with course data
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The file should have columns: Course Code, Course Title, Credit Hour, Prerequisite, Content, UNESCO/New Code
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="import-mode">Import Mode</Label>
              <Select value={importMode} onValueChange={(value: any) => setImportMode(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="update">Update existing, add new</SelectItem>
                  <SelectItem value="replace">Replace matching courses</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {importMode === 'update' 
                  ? 'Updates courses with matching codes, adds new ones'
                  : 'Replaces all data for courses with matching codes'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-file">Select File</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>

            {importMode === 'replace' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Warning: This will replace all data for matching course codes!
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importFile || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result Modal */}
      <Dialog open={showImportResultModal} onOpenChange={setShowImportResultModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Results</DialogTitle>
            <DialogDescription>
              Summary of the import operation
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Created</p>
                        <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Updated</p>
                        <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-destructive" />
                      Errors ({importResult.errors.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {importResult.errors.map((error, index) => (
                        <Alert key={index} variant="destructive">
                          <AlertDescription>
                            <strong>Row {error.row}:</strong> {error.error}
                            <br />
                            <span className="text-xs">
                              Code: {error.data.courseCode || 'N/A'}, Title: {error.data.courseTitle || 'N/A'}
                            </span>
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Details */}
              {(importResult.details.created.length > 0 || importResult.details.updated.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {importResult.details.created.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-green-600">Created Courses</h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {importResult.details.created.map((course, index) => (
                            <div key={index} className="text-sm flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="font-mono">{course.courseCode}</span> - {course.courseTitle}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {importResult.details.updated.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-blue-600">Updated Courses</h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {importResult.details.updated.map((course, index) => (
                            <div key={index} className="text-sm flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-blue-600" />
                              <span className="font-mono">{course.courseCode}</span> - {course.courseTitle}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowImportResultModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Course Detail Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <VisuallyHidden>
              <DialogTitle>Course Details</DialogTitle>
            </VisuallyHidden>
          </DialogHeader>
          {viewingCourse && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header Bar */}
              <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold truncate">{viewingCourse.courseCode}</h2>
                    <p className="text-sm text-muted-foreground truncate">{viewingCourse.courseTitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mr-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowViewModal(false);
                      openEditModal(viewingCourse);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowViewModal(false);
                      handleDeleteCourse(viewingCourse._id, viewingCourse.courseCode);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left Side - Course Information */}
                <div className="w-1/2 p-6 overflow-y-auto border-r space-y-4 min-w-0">
                  {/* Basic Info Card */}
                  <Card className="overflow-hidden">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="truncate">Course Information</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="min-w-0">
                          <Label className="text-xs text-muted-foreground">Course Code</Label>
                          <p className="text-lg font-mono font-bold text-primary mt-1 break-all">
                            {viewingCourse.courseCode}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <Label className="text-xs text-muted-foreground">Credit Hour</Label>
                          <p className="text-lg font-semibold mt-1">
                            {viewingCourse.creditHour}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs text-muted-foreground">Course Title</Label>
                        <p className="text-base font-medium mt-1 break-words">
                          {viewingCourse.courseTitle}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs text-muted-foreground">UNESCO/New Code</Label>
                        <p className="text-sm font-mono mt-1 break-all">
                          {viewingCourse.unescoCode || 'N/A'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <List className="h-3 w-3 flex-shrink-0" />
                          Prerequisite
                        </Label>
                        <p className="text-sm mt-1 break-words">
                          {viewingCourse.prerequisite || 'N/A'}
                        </p>
                      </div>
                      {(viewingCourse.majors || []).length > 0 && (
                        <div className="min-w-0">
                          <Label className="text-xs text-muted-foreground">Majors</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(viewingCourse.majors || []).map((m) => (
                              <Badge key={m} variant="outline">{m}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Content Card */}
                  {viewingCourse.content && (
                    <Card className="overflow-hidden">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                          <span className="truncate">Course Content</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="overflow-hidden">
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words overflow-wrap-anywhere">
                          <HTMLContentRenderer content={viewingCourse.content} />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Metadata Card */}
                  <Card className="overflow-hidden">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Clock className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="truncate">Metadata</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {viewingCourse.createdAt && (
                        <div className="flex justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground flex-shrink-0">Created:</span>
                          <span className="text-right break-words">{new Date(viewingCourse.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        </div>
                      )}
                      {viewingCourse.updatedAt && (
                        <div className="flex justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground flex-shrink-0">Last Updated:</span>
                          <span className="text-right break-words">{new Date(viewingCourse.updatedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right Side - Placeholder */}
                <div className="w-1/2 p-6 flex items-center justify-center bg-muted/20 overflow-hidden">
                  <div className="text-center">
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <FileText className="h-12 w-12 text-muted-foreground opacity-50" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
                    <p className="text-muted-foreground">
                      Additional features will be available here
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Modal */}
      <Dialog open={showDeleteAllModal} onOpenChange={setShowDeleteAllModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete All Courses
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all {courses.length} courses from the catalogue. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> This will remove all course data permanently.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Type <strong>DELETE ALL</strong> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder="DELETE ALL"
                className="font-mono"
              />
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>• All {courses.length} courses will be deleted</p>
              <p>• This action is irreversible</p>
              <p>• Teachers can still use their existing courses</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteAllModal(false);
                setDeleteAllConfirmText('');
              }}
              disabled={deletingAll}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllCourses}
              disabled={deleteAllConfirmText !== 'DELETE ALL' || deletingAll}
            >
              {deletingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash className="h-4 w-4 mr-2" />
                  Delete All Courses
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Fixed Registry Modal */}
      <Dialog open={showRegistryModal} onOpenChange={setShowRegistryModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Fixed Registry</DialogTitle>
            <DialogDescription>
              Compare the DB catalogue against the PDF-transcribed fixed registry for a major, and merge selected courses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="registry-major">Major</Label>
              <Select
                value={registryMajor}
                onValueChange={(value) => {
                  setRegistryMajor(value);
                  fetchRegistryDiff(value);
                }}
              >
                <SelectTrigger id="registry-major">
                  <SelectValue placeholder="Select a major..." />
                </SelectTrigger>
                <SelectContent>
                  {fixedPrograms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.icon} {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {registryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !registryMajor ? null : !registryAvailable ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>No fixed catalogue available for this major.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {registryEntries.filter(e => e.status === 'new').length} new,{' '}
                    {registryEntries.filter(e => e.status === 'changed').length} changed,{' '}
                    {registryEntries.filter(e => e.status === 'unchanged').length} unchanged
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => fetchRegistryDiff(registryMajor)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Refresh
                  </Button>
                </div>

                <div className="border rounded-lg max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>UNESCO Code</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registryEntries.map((entry) => (
                        <TableRow key={entry.code}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedRegistryCodes.has(entry.code)}
                              onChange={() => toggleRegistryCode(entry.code)}
                            />
                          </TableCell>
                          <TableCell className="font-mono">{entry.code}</TableCell>
                          <TableCell>
                            {entry.title}
                            {entry.status === 'changed' && entry.existing && entry.existing.courseTitle !== entry.title && (
                              <div className="text-xs text-muted-foreground">was: {entry.existing.courseTitle}</div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {entry.unescoCode}
                            {entry.status === 'changed' && entry.existing && entry.existing.unescoCode !== entry.unescoCode && (
                              <div className="text-muted-foreground">was: {entry.existing.unescoCode || 'N/A'}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={entry.status === 'new' ? 'default' : entry.status === 'changed' ? 'secondary' : 'outline'}
                            >
                              {entry.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegistryModal(false)}>
              Close
            </Button>
            <Button
              onClick={handleRegistryImport}
              disabled={registryImporting || selectedRegistryCodes.size === 0}
            >
              {registryImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Selected ({selectedRegistryCodes.size})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// HTML Content Renderer Component
function HTMLContentRenderer({ content }: { content: string }) {
  return (
    <div 
      className="prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: content }} 
    />
  );
}
