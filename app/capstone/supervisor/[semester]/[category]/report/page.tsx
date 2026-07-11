'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Plus, Edit, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface Student {
  _id: string;
  name: string;
  rollNumber?: string;
  studentId?: string;
}

interface CapstoneRecord {
  _id: string;
  studentId: Student;
  reportMarks?: number;
  reportComments?: string;
  createdAt: string;
}

interface CapstoneGroup {
  _id: string;
  groupName: string;
  courseId: {
    _id: string;
    code: string;
    name: string;
  };
  supervisorId: {
    _id: string;
    name: string;
  };
  semester?: string;
  studentIds: Student[];
}

export default function ReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const semester = params?.semester as string;
  const category = params?.category as string;
  const [students, setStudents] = useState<Student[]>([]);
  const [capstoneRecords, setCapstoneRecords] = useState<CapstoneRecord[]>([]);
  const [capstoneGroups, setCapstoneGroups] = useState<CapstoneGroup[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [marks, setMarks] = useState('');
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchStudents();
      fetchCapstoneRecords();
      fetchCapstoneGroups();
    }
  }, [status, router]);

  const fetchStudents = async () => {
    try {
      const response = await fetch('/api/students');
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('Failed to load students');
    }
  };

  const fetchCapstoneRecords = async () => {
    try {
      const response = await fetch('/api/capstone?submissionType=report');
      if (!response.ok) throw new Error('Failed to fetch records');
      const data = await response.json();
      setCapstoneRecords(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching capstone records:', error);
      setLoading(false);
    }
  };

  const fetchCapstoneGroups = async () => {
    try {
      const response = await fetch(`/api/capstone-groups?semester=${encodeURIComponent(semester)}`);
      if (!response.ok) throw new Error('Failed to fetch groups');
      const data: CapstoneGroup[] = await response.json();
      setCapstoneGroups(data);
    } catch (error) {
      console.error('Error fetching capstone groups:', error);
      toast.error('Failed to load capstone groups');
    }
  };

  const handleOpenModal = (student: Student) => {
    const existingRecord = capstoneRecords.find(
      (r) => r.studentId._id === student._id
    );
    setSelectedStudent(student);
    if (existingRecord) {
      setMarks(existingRecord.reportMarks?.toString() || '');
      setComments(existingRecord.reportComments || '');
    } else {
      setMarks('');
      setComments('');
    }
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedStudent || marks === '') {
      toast.error('Please fill in all required fields');
      return;
    }

    const marksNum = parseFloat(marks);
    if (isNaN(marksNum) || marksNum < 0 || marksNum > 100) {
      toast.error('Marks must be between 0 and 100');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/capstone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent._id,
          supervisorId: session?.user?.id,
          reportMarks: marksNum,
          reportComments: comments,
          submissionType: 'report',
        }),
      });

      if (!response.ok) throw new Error('Failed to submit marks');
      
      toast.success('Marks submitted successfully');
      setShowModal(false);
      fetchCapstoneRecords();
    } catch (error) {
      console.error('Error submitting marks:', error);
      toast.error('Failed to submit marks');
    } finally {
      setSubmitting(false);
    }
  };

  const normalizeSemester = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const getFilteredCapstoneGroups = () => {
    if (!groupSearchQuery.trim()) {
      return capstoneGroups;
    }

    const query = groupSearchQuery.toLowerCase();
    return capstoneGroups.filter(
      (group) =>
        group.groupName.toLowerCase().includes(query) ||
        group.courseId?.code?.toLowerCase().includes(query) ||
        group.supervisorId?.name?.toLowerCase().includes(query) ||
        group.semester?.toLowerCase().includes(query) ||
        group.studentIds?.some(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.studentId?.toLowerCase().includes(query)
        )
    );
  };

  const getSemesterGroupLabel = (groupSemester?: string) => {
    if (!groupSemester) return 'N/A';
    return normalizeSemester(groupSemester) === normalizeSemester(semester)
      ? groupSemester
      : groupSemester;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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
                  {semester} - {category} - Report Marks
                </h1>
                <p className="text-xs text-muted-foreground">
                  Submit report marks for {category} students
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/capstone/supervisor/${semester}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Submit Report Marks - {category}</h2>
          <p className="text-muted-foreground">
            Enter and manage report marks for your capstone students ({semester})
          </p>
        </div>

        {/* Capstone Groups Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>All Capstone Groups</CardTitle>
            <CardDescription>
              View all capstone groups in the system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {capstoneGroups.length === 0 ? (
              <p className="text-muted-foreground">No capstone groups found</p>
            ) : (
              <>
                <Input
                  placeholder="Search by group name, course, semester, supervisor, or student..."
                  value={groupSearchQuery}
                  onChange={(e) => setGroupSearchQuery(e.target.value)}
                  className="w-full"
                />

                <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-3">
                  {getFilteredCapstoneGroups().length > 0 ? (
                    getFilteredCapstoneGroups().map((group) => (
                      <div
                        key={group._id}
                        className="p-3 bg-muted rounded-lg border border-border hover:border-blue-300 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-sm">{group.groupName}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.courseId?.code} • Course: {group.courseId?.name}
                              {group.semester && ` • Semester: ${getSemesterGroupLabel(group.semester)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {group.studentIds?.length || 0} members
                            </span>
                            <Button
                              size="sm"
                              onClick={() => router.push(`/capstone/supervisor/${semester}/${category}/report/group/${group._id}`)}
                              className="ml-2"
                            >
                              Submit Marks
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          Supervisor: <span className="font-medium">{group.supervisorId?.name}</span>
                        </p>
                        <div className="text-xs">
                          <p className="font-medium text-muted-foreground mb-1">Members:</p>
                          <ul className="space-y-1 pl-2">
                            {group.studentIds?.map((student) => (
                              <li key={student._id} className="text-muted-foreground">
                                {student.name} ({student.studentId || student.rollNumber || 'N/A'})
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      No groups match your search
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.length > 0 ? (
            students.map((student) => {
              const record = capstoneRecords.find(
                (r) => r.studentId._id === student._id
              );
              const hasSubmitted = !!record?.reportMarks;

              return (
                <Card key={student._id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{student.name}</CardTitle>
                        <CardDescription>{student.rollNumber}</CardDescription>
                      </div>
                      {hasSubmitted && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Submitted
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    {hasSubmitted && (
                      <div className="mb-4">
                        <p className="text-sm text-muted-foreground">Marks</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {record?.reportMarks}/100
                        </p>
                        {record?.reportComments && (
                          <p className="text-sm mt-2 text-muted-foreground">
                            {record.reportComments}
                          </p>
                        )}
                      </div>
                    )}
                    <Button
                      onClick={() => handleOpenModal(student)}
                      className="w-full"
                      variant={hasSubmitted ? 'outline' : 'default'}
                    >
                      {hasSubmitted ? (
                        <>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Marks
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Marks
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  No students available
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Submit Report Marks</DialogTitle>
            <DialogDescription>
              {selectedStudent?.name} ({selectedStudent?.rollNumber})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="marks">
                Marks (0-100) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="marks"
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="Enter marks"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="comments">Comments</Label>
              <textarea
                id="comments"
                placeholder="Add feedback or comments (optional)"
                value={comments}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComments(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Marks'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
