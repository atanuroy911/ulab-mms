"use client";

import { useEffect, useState } from 'react';
import { Bug, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

export default function BugReportButton() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  // The global search's "Report a bug / request a feature" action opens this dialog.
  useEffect(() => {
    const openDialog = () => setOpen(true);
    window.addEventListener('open-bug-report', openDialog);
    return () => window.removeEventListener('open-bug-report', openDialog);
  }, []);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('Bugs');
  const [issue, setIssue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue.trim()) {
      toast.error('Please describe the issue');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: session?.user?.name || 'Unknown User',
          email: session?.user?.email || 'No Email',
          type,
          issue,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success('Bug report submitted successfully!');
        setOpen(false);
        setIssue('');
      } else {
        if (data.details) {
          toast.error(`Error: ${data.error}`, { description: data.details });
        } else {
          toast.error(data.error || 'Failed to submit bug report');
        }
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50 p-0"
        aria-label="Report a Bug"
        title="Report a bug or request a feature"
      >
        <Bug className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Feedback & Bug Reports</DialogTitle>
            <DialogDescription>
              Found an issue or have a great idea? Let us know!
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label htmlFor="report-type" className="text-sm font-medium">
                Report Type
              </label>
              <select
                id="report-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-10 px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/50 bg-background"
                disabled={loading}
              >
                <option value="Bugs">Bug / Issue</option>
                <option value="Feature Request">Feature Request</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="bug-issue" className="text-sm font-medium">
                {type === 'Bugs' ? 'Issue / Bug Description' : 'Feature Description'} <span className="text-destructive">*</span>
              </label>
              <textarea
                id="bug-issue"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder={type === 'Bugs' ? "Describe what happened or what isn't working..." : "Describe the feature you'd like to see..."}
                className="w-full min-h-[140px] px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                disabled={loading}
                required
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Report
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
