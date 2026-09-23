'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Workflow, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Pins a published grading-scheme version to each track of a session.
 *
 * A track is always pinned to a specific published VERSION, never to a scheme's live draft -
 * that is what stops an edit made halfway through a semester from silently re-grading
 * students who were already marked under the old arithmetic.
 */

interface SchemeOption {
  _id: string;
  name: string;
  track: 'A' | 'B' | 'C' | null;
  currentVersion: number;
  isArchived: boolean;
}

interface TrackState {
  track: string;
  gradingSchemeId?: string | null;
  gradingSchemeVersion?: number | null;
}

interface Props {
  sessionId: string;
  department: string;
  tracks: TrackState[];
  onUpdated: (updatedTracks: TrackState[]) => void;
}

const UNPINNED = '__none__';

export function TrackSchemePanel({ sessionId, department, tracks, onUpdated }: Props) {
  const [schemes, setSchemes] = useState<SchemeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTrack, setSavingTrack] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/capstone/grading-schemes?department=${encodeURIComponent(department)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load grading schemes');
        setSchemes(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load grading schemes');
      } finally {
        setLoading(false);
      }
    })();
  }, [department]);

  const pin = async (track: string, schemeId: string) => {
    setSavingTrack(track);
    try {
      const scheme = schemes.find((s) => s._id === schemeId);
      const res = await fetch(`/api/capstone/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackSchemes: [
            schemeId === UNPINNED
              ? { track, gradingSchemeId: null }
              : { track, gradingSchemeId: schemeId, gradingSchemeVersion: scheme?.currentVersion },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      onUpdated(data.tracks);
      toast.success(
        schemeId === UNPINNED ? `Track ${track} unpinned` : `Track ${track} now grades under "${scheme?.name}"`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingTrack(null);
    }
  };

  // Only published schemes can be pinned - an unpublished draft has no immutable version to
  // point at, so offering it would create a pin that can't be honoured.
  const publishable = schemes.filter((s) => s.currentVersion > 0 && !s.isArchived);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4" />
              Grading Scheme per Track
            </CardTitle>
            <CardDescription>
              Each track grades under the published version pinned here.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/capstone/grading-schemes">
                <ExternalLink className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Edit schemes</span>
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/capstone/sessions/${sessionId}/grades`}>
                <FileSpreadsheet className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">View grades</span>
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : publishable.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No published grading schemes for {department} yet.{' '}
            <Link href="/capstone/grading-schemes" className="text-primary hover:underline">
              Create and publish one
            </Link>{' '}
            to grade this session.
          </p>
        ) : (
          tracks.map((track) => {
            const pinnedId = track.gradingSchemeId ? String(track.gradingSchemeId) : UNPINNED;
            const pinned = schemes.find((s) => s._id === pinnedId);
            return (
              <div
                key={track.track}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-3 sm:flex-nowrap"
              >
                <span className="w-16 shrink-0 text-sm font-medium">Track {track.track}</span>

                <Select
                  value={pinnedId}
                  disabled={savingTrack === track.track}
                  onValueChange={(v) => pin(track.track, v)}
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder="Not pinned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNPINNED}>Not pinned</SelectItem>
                    {publishable.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name} (v{s.currentVersion})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {savingTrack === track.track ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : pinned && track.gradingSchemeVersion ? (
                  <Badge variant="secondary" className="shrink-0">
                    v{track.gradingSchemeVersion}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    none
                  </Badge>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
