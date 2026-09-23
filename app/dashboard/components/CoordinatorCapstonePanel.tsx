'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GraduationCap,
  Users,
  Mail,
  Download,
  ChevronRight,
  AlertCircle,
  Loader2,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';

interface SessionRow {
  _id: string;
  semesterId: { _id: string; name: string } | string;
  department: string;
  status: 'draft' | 'open' | 'grading' | 'closed';
  journalWeekCount: number;
  tracks: { track: string; isOpen: boolean }[];
  coordinatorIds: string[];
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  grading: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  closed: 'bg-secondary text-secondary-foreground',
};

interface Props {
  canEdit: boolean; // true for admin, false for coordinator-only
  userId: string;
}

export default function CoordinatorCapstonePanel({ canEdit, userId }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingMarks, setRequestingMarks] = useState<string | null>(null);
  const [exportingMarks, setExportingMarks] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/capstone/sessions?mine=true');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      } else {
        toast.error('Failed to load capstone sessions');
      }
    } catch {
      toast.error('Failed to load capstone sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const requestMarks = async (sessionId: string) => {
    setRequestingMarks(sessionId);
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/request-marks`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send notifications');
      toast.success(`Notifications sent to ${data.sent} recipient(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send notifications');
    } finally {
      setRequestingMarks(null);
    }
  };

  const exportMarks = async (sessionId: string, department: string) => {
    setExportingMarks(sessionId);
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/marks-export`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capstone-marks-${department}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingMarks(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground flex flex-col items-center gap-2 py-10">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p>No capstone sessions found for your department.</p>
          {canEdit && (
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link href="/admin/dashboard?tab=capstone">Open a Capstone Session</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const semName =
          typeof session.semesterId === 'object' ? session.semesterId.name : '';
        const statusClass = STATUS_COLOR[session.status] ?? STATUS_COLOR.draft;
        const isRequesting = requestingMarks === session._id;
        const isExporting = exportingMarks === session._id;
        const isOpenOrGrading = session.status === 'open' || session.status === 'grading';

        return (
          <Card
            key={session._id}
            className="hover:shadow-md transition-shadow border-border/60"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">
                      {session.department}
                      {semName ? ` — ${semName}` : ''}
                    </CardTitle>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass}`}
                    >
                      {session.status}
                    </span>
                  </div>
                  <CardDescription className="mt-1 flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                    Tracks {session.tracks.map((t) => t.track).join(', ')} &bull;{' '}
                    {session.journalWeekCount} week journal
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {isOpenOrGrading && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestMarks(session._id)}
                      disabled={isRequesting}
                      title="Email all supervisors and evaluators to submit their marks"
                    >
                      {isRequesting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5 hidden sm:inline">Request Marks</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportMarks(session._id, session.department)}
                    disabled={isExporting}
                    title="Download marks summary as CSV"
                  >
                    {isExporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Export Marks</span>
                  </Button>
                  {canEdit && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/dashboard?tab=capstone`}>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span className="ml-1 hidden sm:inline">Manage</span>
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0">
              <Link href="/capstone" className="group inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Users className="h-3.5 w-3.5" />
                View my assigned groups
                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {canEdit && (
                <Link
                  href="/capstone/grading-schemes"
                  className="group inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Workflow className="h-3.5 w-3.5" />
                  Grading schemes
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
