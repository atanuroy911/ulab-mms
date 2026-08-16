'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Plus, Edit, CheckCircle2 } from 'lucide-react';
import { AppHeader } from '@/app/components/AppHeader';
import Image from 'next/image';
import { toast } from 'sonner';

interface Student {
  _id: string;
  name: string;
  rollNumber: string;
}

interface CapstoneRecord {
  _id: string;
  studentId: Student;
  evaluatorReportMarks?: number;
  evaluatorReportComments?: string;
  createdAt: string;
}

interface PageProps {
  params: {
    category: string;
  };
}

export default function EvaluatorReportPage({ params }: PageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { category } = params;
  const [students, setStudents] = useState<Student[]>([]);
  const [capstoneRecords, setCapstoneRecords] = useState<CapstoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [marks, setMarks] = useState('');
  const [comments, setComments] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchStudents();
      fetchCapstoneRecords();
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
      const response = await fetch('/api/capstone?submissionType=evaluatorReport');
      if (!response.ok) throw new Error('Failed to fetch records');
      const data = await response.json();
      setCapstoneRecords(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching capstone records:', error);
      setLoading(false);
    }
  };

  const handleOpenModal = (student: Student) => {
    const existingRecord = capstoneRecords.find(
      (r) => r.studentId._id === student._id
    );
    setSelectedStudent(student);
    if (existingRecord) {
      setMarks(existingRecord.evaluatorReportMarks?.toString() || '');
      setComments(existingRecord.evaluatorReportComments || '');
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
          evaluatorId: session?.user?.id,
          evaluatorReportMarks: marksNum,
          evaluatorReportComments: comments,
          submissionType: 'evaluatorReport',
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

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.rollNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={`${category} - Evaluator Report Marks`}
        subtitle={`Submit report evaluation marks for ${category} students`}
        gradient="purple"
        logoHref="/capstone/evaluator"
        actions={[
          { key: 'back', label: 'Back', icon: ArrowLeft, href: '/capstone/evaluator', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      <div className="max-w-6xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Submit Evaluator Report Marks - {category}</h2>
          <p className="text-muted-foreground">
            Enter and manage report evaluation marks for your assigned students
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <Input
            placeholder="Search by student name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Students Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.length > 0 ? (
            filteredStudents.map((student) => {
              const record = capstoneRecords.find(
                (r) => r.studentId._id === student._id
              );
              const hasSubmitted = !!record?.evaluatorReportMarks;

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
                        <p className="text-2xl font-bold text-purple-600">
                          {record?.evaluatorReportMarks}/100
                        </p>
                        {record?.evaluatorReportComments && (
                          <p className="text-sm mt-2 text-muted-foreground">
                            {record.evaluatorReportComments}
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
                  {searchQuery ? 'No students found matching your search' : 'No students available'}
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
            <DialogTitle>Submit Evaluator Report Marks</DialogTitle>
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
