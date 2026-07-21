"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Student {
  _id: string;
  name: string;
  studentId?: string;
}

export default function ReportGroupMarksPage() {
  const router = useRouter();
  const params = useParams();
  const semester = params?.semester as string;
  const category = params?.category as string;
  const groupId = params?.groupId as string;
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    fetchGroup();
  }, [groupId]);

  const fetchGroup = async () => {
    try {
      const res = await fetch(`/api/capstone-groups/${groupId}`);
      if (!res.ok) throw new Error('Failed to fetch group');
      const data = await res.json();

      setGroupName(data.groupName || 'Group');
      setStudents(data.studentIds || []);
      const initialMarks: Record<string, number> = {};
      (data.studentIds || []).forEach((s: any) => { initialMarks[s._id] = 0; });
      setMarks(initialMarks);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load group');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (studentId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setMarks((m) => ({ ...m, [studentId]: Math.max(0, Math.min(100, num)) }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        groupId,
        marks: students.map((s) => ({ _id: s._id, name: s.name, studentId: s.studentId, marks: marks[s._id] })),
      };

      const res = await fetch('/api/capstone/submit-report-marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to submit marks');
      }

      toast.success('Report marks submitted');
      router.push(`/capstone/supervisor/${semester}/${category}/report`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit marks');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Submit Report Marks - {groupName}</CardTitle>
          <CardDescription>Enter marks for each member (0-100)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {students.map((s) => (
              <div key={s._id} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-muted-foreground">{s.studentId}</div>
                </div>
                <div className="w-36">
                  <Input type="number" min={0} max={100} step={0.5} value={marks[s._id]} onChange={(e) => handleChange(s._id, e.target.value)} />
                </div>
              </div>
            ))}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Marks'}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
