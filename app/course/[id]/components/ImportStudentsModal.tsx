'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parseCSV } from '@/app/utils/csv';
import { toast } from 'sonner';

interface Student {
  _id: string;
  studentId: string;
  name: string;
}

interface ImportStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  courseId: string;
  onImportComplete: () => Promise<void>;
}

export function ImportStudentsModal({
  isOpen,
  onClose,
  students,
  courseId,
  onImportComplete,
}: ImportStudentsModalProps) {
  const [csvInput, setCsvInput] = useState('');
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  // Diffing logic
  const diffResult = useMemo(() => {
    if (!csvInput.trim()) {
      return { toAdd: [], unchanged: [], missing: [] };
    }

    const parsedStudents = parseCSV(csvInput);
    if (parsedStudents.length === 0) {
      return { toAdd: [], unchanged: [], missing: [] };
    }

    const currentStudentIds = new Set(students.map(s => s.studentId));
    const parsedStudentIds = new Set(parsedStudents.map(s => s.id));

    const toAdd = parsedStudents.filter(s => !currentStudentIds.has(s.id));
    const unchanged = parsedStudents.filter(s => currentStudentIds.has(s.id));
    
    // Find missing students (they exist in the course, but are not in the CSV)
    const missing = students.filter(s => !parsedStudentIds.has(s.studentId));

    return { toAdd, unchanged, missing };
  }, [csvInput, students]);

  const handleImport = async () => {
    try {
      if (diffResult.toAdd.length === 0 && diffResult.missing.length === 0) {
        setError('No new students to add or missing students to process.');
        return;
      }

      setIsImporting(true);
      setError('');

      let addedCount = 0;
      let deletedCount = 0;

      // 1. Add new students
      if (diffResult.toAdd.length > 0) {
        const response = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            students: diffResult.toAdd.map(s => ({
              studentId: s.id,
              name: s.name,
            })),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error adding students');
        }
        addedCount = data.students?.length || 0;
      }

      // 2. Delete missing students (if requested)
      if (deleteMissing && diffResult.missing.length > 0) {
        const studentIdsToDelete = diffResult.missing.map(s => s._id);
        const deleteResponse = await fetch(`/api/courses/${courseId}/students`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds: studentIdsToDelete }),
        });

        const deleteData = await deleteResponse.json().catch(() => ({}));
        if (!deleteResponse.ok) {
          throw new Error(deleteData.error || 'Error deleting missing students');
        }
        deletedCount = deleteData.deletedStudents || 0;
      }

      toast.success(`Import completed. Added ${addedCount} student(s)${deleteMissing ? `, removed ${deletedCount} student(s)` : ''}.`);
      setCsvInput('');
      setDeleteMissing(false);
      await onImportComplete();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred during import');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setCsvInput('');
    setDeleteMissing(false);
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Students (CSV)
          </DialogTitle>
          <DialogDescription>
            Import multiple students using CSV format. The list will be compared against the current roster.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <Label>CSV Data (Format: StudentID, StudentName)</Label>
            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              className="w-full h-32 px-4 py-3 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground placeholder-muted-foreground mt-2 font-mono text-sm"
              placeholder="e.g.&#10;212014001, John Doe&#10;221016002, Jane Smith"
            />
          </div>

          {csvInput.trim() && diffResult.toAdd.length === 0 && diffResult.unchanged.length === 0 && diffResult.missing.length === 0 && (
             <Alert>
               <AlertDescription className="text-xs">
                 Please ensure the format is correct. Expected: StudentID, StudentName
               </AlertDescription>
             </Alert>
          )}

          {(diffResult.toAdd.length > 0 || diffResult.unchanged.length > 0 || diffResult.missing.length > 0) && (
            <div className="bg-muted/30 p-4 rounded-lg space-y-3 text-sm border">
              <h4 className="font-semibold text-foreground border-b pb-2">Import Summary</h4>
              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-2 rounded">
                  <div className="font-bold text-lg">{diffResult.toAdd.length}</div>
                  <div className="text-xs">To Add</div>
                </div>
                <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2 rounded">
                  <div className="font-bold text-lg">{diffResult.unchanged.length}</div>
                  <div className="text-xs">Unchanged</div>
                </div>
                <div className="bg-orange-500/10 text-orange-600 dark:text-orange-400 p-2 rounded">
                  <div className="font-bold text-lg">{diffResult.missing.length}</div>
                  <div className="text-xs">Missing</div>
                </div>
              </div>

              {diffResult.missing.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-start space-x-2">
                    <Checkbox 
                      id="deleteMissing" 
                      checked={deleteMissing} 
                      onCheckedChange={(checked) => setDeleteMissing(checked === true)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="deleteMissing"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5 cursor-pointer text-destructive"
                      >
                        Delete missing students
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-4 h-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[250px]">
                              <p>Checking this will permanently remove students (and their marks) who are currently enrolled but are missing from the imported CSV.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </label>
                      <p className="text-[13px] text-muted-foreground mt-1">
                        {diffResult.missing.length} student(s) likely dropped the course during Add/Drop and will be removed.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={isImporting || (!csvInput.trim()) || (diffResult.toAdd.length === 0 && (!deleteMissing || diffResult.missing.length === 0))}
          >
            {isImporting ? 'Processing...' : 'Confirm Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
