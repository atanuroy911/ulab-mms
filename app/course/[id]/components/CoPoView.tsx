import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save, GitMerge, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

interface CoPoViewProps {
  course: any;
  exams: any[];
  onUpdate: () => void;
}

export default function CoPoView({ course, exams, onUpdate }: CoPoViewProps) {
  const [maxMarks, setMaxMarks] = useState<Record<string, number[]>>({});
  const [mapping, setMapping] = useState<boolean[][]>([]);
  const [numberOfCOs, setNumberOfCOs] = useState<Record<string, string>>({});
  const [isSavingMarks, setIsSavingMarks] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [savingCOsExamId, setSavingCOsExamId] = useState<string | null>(null);
  const [togglingCoPoEnabled, setTogglingCoPoEnabled] = useState(false);
  const [showManageExamsModal, setShowManageExamsModal] = useState(false);
  const [manageExamDraft, setManageExamDraft] = useState<Record<string, string>>({});
  const [savingManageExamId, setSavingManageExamId] = useState<string | null>(null);

  // Exams with per-exam CO tracking turned on (numberOfCOs > 0). Project-category exams are
  // excluded here — they share one combined CO configuration (set via a Project exam's gear
  // icon) instead of a per-exam one. Enabling/disabling CO tracking for an exam happens in the
  // Add Exam / Exam Settings modal, not here — this table only configures already-enabled exams.
  const examsWithCOs = exams.filter(e => e.examCategory !== 'Project' && e.numberOfCOs && e.numberOfCOs > 0);
  const projectNumberOfCOs = course.coPoMapping?.projectNumberOfCOs || 0;
  const hasProjectExams = exams.some(e => e.examCategory === 'Project');

  // Every exam that could plausibly track COs — everything except Project (combined mechanism
  // above) — for the quick-toggle management list.
  const manageableExams = exams.filter(e => e.examCategory !== 'Project');

  const handleToggleExamCO = async (examId: string, enabled: boolean) => {
    setSavingManageExamId(examId);
    try {
      const response = await fetch(`/api/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberOfCOs: enabled ? 6 : 0 }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update CO tracking');
      }
      setManageExamDraft(prev => ({ ...prev, [examId]: enabled ? '6' : '0' }));
      toast.success(enabled ? 'CO tracking turned on' : 'CO tracking turned off');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setSavingManageExamId(null);
    }
  };

  const handleSaveManageExamCOCount = async (examId: string) => {
    const value = parseInt(manageExamDraft[examId] || '0', 10);
    if (isNaN(value) || value < 1 || value > 6) {
      toast.error('Number of COs must be between 1 and 6');
      return;
    }
    setSavingManageExamId(examId);
    try {
      const response = await fetch(`/api/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberOfCOs: value }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update number of COs');
      }
      toast.success('Number of COs updated');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setSavingManageExamId(null);
    }
  };

  useEffect(() => {
    // Initialize max marks
    const initialMaxMarks = course.coPoMapping?.maxMarks || {};
    
    // Ensure all exams with COs have an entry initialized if missing
    examsWithCOs.forEach(exam => {
      if (!initialMaxMarks[exam._id]) {
        initialMaxMarks[exam._id] = [0, 0, 0, 0, 0, 0];
      }
    });
    setMaxMarks({ ...initialMaxMarks });

    // Initialize mapping grid
    let initialMapping = course.coPoMapping?.mapping;
    if (!initialMapping || initialMapping.length !== 6 || initialMapping[0].length !== 12) {
      initialMapping = Array(6).fill(null).map(() => Array(12).fill(false));
    }
    setMapping(initialMapping);

    // Initialize per-exam number of COs
    const initialNumberOfCOs: Record<string, string> = {};
    examsWithCOs.forEach(exam => {
      initialNumberOfCOs[exam._id] = (exam.numberOfCOs || 0).toString();
    });
    setNumberOfCOs(initialNumberOfCOs);

    // Initialize the "manage CO for exams" draft with every non-Project exam's current count
    const initialManageDraft: Record<string, string> = {};
    exams.filter((e: any) => e.examCategory !== 'Project').forEach((exam: any) => {
      initialManageDraft[exam._id] = (exam.numberOfCOs || 0).toString();
    });
    setManageExamDraft(initialManageDraft);
  }, [course, exams]);

  const handleMaxMarkChange = (examId: string, coIndex: number, value: string) => {
    const numericValue = value === '' ? 0 : parseFloat(value);
    
    setMaxMarks(prev => {
      const updated = { ...prev };
      if (!updated[examId]) updated[examId] = [0, 0, 0, 0, 0, 0];
      updated[examId][coIndex] = isNaN(numericValue) ? 0 : numericValue;
      return updated;
    });
  };

  const handleMappingChange = (coIndex: number, poIndex: number, checked: boolean) => {
    setMapping(prev => {
      const updated = prev.map(row => [...row]);
      updated[coIndex][poIndex] = checked;
      return updated;
    });
  };

  const handleSaveMarks = async () => {
    setIsSavingMarks(true);
    try {
      const response = await fetch(`/api/courses/${course._id}/copo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMarks }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save CO marks distribution');
      }

      toast.success('CO marks distribution saved successfully');
      onUpdate(); // Trigger parent refresh
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setIsSavingMarks(false);
    }
  };

  const handleSaveMapping = async () => {
    setIsSavingMapping(true);
    try {
      const response = await fetch(`/api/courses/${course._id}/copo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save CO-PO mapping');
      }

      toast.success('CO-PO mapping saved successfully');
      onUpdate(); // Trigger parent refresh
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setIsSavingMapping(false);
    }
  };

  const handleNumberOfCOsChange = (examId: string, value: string) => {
    setNumberOfCOs(prev => ({ ...prev, [examId]: value }));
  };

  const handleSaveNumberOfCOs = async (examId: string) => {
    const value = parseInt(numberOfCOs[examId] || '0', 10);
    if (isNaN(value) || value < 0 || value > 10) {
      toast.error('Number of COs must be between 0 and 10');
      return;
    }
    setSavingCOsExamId(examId);
    try {
      const response = await fetch(`/api/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberOfCOs: value }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update number of COs');
      }

      toast.success('Number of COs updated successfully');
      onUpdate(); // Trigger parent refresh
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setSavingCOsExamId(null);
    }
  };

  const handleToggleCoPoMapping = async (enabled: boolean) => {
    setTogglingCoPoEnabled(true);
    try {
      const response = await fetch(`/api/courses/${course._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coPoMappingEnabled: enabled }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update CO-PO mapping setting');
      }

      toast.success(enabled ? 'CO-PO mapping turned on' : 'CO-PO mapping turned off');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setTogglingCoPoEnabled(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">CO-PO Mapping</h3>
          <p className="text-muted-foreground">Configure CO maximum marks and map them to Program Outcomes.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">Does this course track CO-PO mapping?</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={course.coPoMappingEnabled !== false ? 'default' : 'outline'}
              disabled={togglingCoPoEnabled}
              onClick={() => handleToggleCoPoMapping(true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              size="sm"
              variant={course.coPoMappingEnabled === false ? 'default' : 'outline'}
              disabled={togglingCoPoEnabled}
              onClick={() => handleToggleCoPoMapping(false)}
            >
              No
            </Button>
          </div>
        </div>
      </div>

      {hasProjectExams && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <GitMerge className="mr-2 h-5 w-5 text-primary" />
              Combined {course.courseType === 'Lab' ? 'OEL/CE' : 'Project'} COs
            </CardTitle>
            <CardDescription>
              {projectNumberOfCOs > 0 ? (
                <>
                  {projectNumberOfCOs} CO(s) configured, shared across every {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} exam
                  {course.coPoMapping?.projectCoMode === 'weightage'
                    ? <> and scaled to the {Number(course.projectWeightage || 0)}% weightage</>
                    : <> and scaled to the exams&apos; raw total marks</>}
                  . Configure from any project exam's gear icon in the Exams tab.
                </>
              ) : (
                <>Not configured yet — open any {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} exam's gear icon in the Exams tab to set combined COs.</>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center">
              <GitMerge className="mr-2 h-5 w-5 text-primary" />
              Maximum CO Marks per Exam
            </CardTitle>
            <CardDescription>
              Set the number of COs per exam and the maximum attainable marks for each Course Outcome.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setShowManageExamsModal(true)}>
              <ListChecks className="mr-2 h-4 w-4" />
              Manage CO for exams
            </Button>
            <Button onClick={handleSaveMarks} disabled={isSavingMarks}>
              {isSavingMarks ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save CO Marks
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {examsWithCOs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              No exams are tracking Course Outcomes yet. Turn on &quot;Track Course Outcomes&quot; for an exam from the Add Exam or Exam Settings dialog to configure its CO marks here.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Exam Name</TableHead>
                  <TableHead className="text-center w-[130px]"># of COs</TableHead>
                  <TableHead className="text-center w-[120px]">CO 1</TableHead>
                  <TableHead className="text-center w-[120px]">CO 2</TableHead>
                  <TableHead className="text-center w-[120px]">CO 3</TableHead>
                  <TableHead className="text-center w-[120px]">CO 4</TableHead>
                  <TableHead className="text-center w-[120px]">CO 5</TableHead>
                  <TableHead className="text-center w-[120px]">CO 6</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examsWithCOs.map((exam) => (
                  <TableRow key={exam._id}>
                    <TableCell className="font-medium">
                      {exam.displayName}
                      <span className="block text-xs text-muted-foreground mt-1">Total: {exam.totalMarks}</span>
                    </TableCell>
                    <TableCell className="text-center p-2">
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="10"
                          step="1"
                          className="w-16 text-center h-9"
                          value={numberOfCOs[exam._id] ?? ''}
                          onChange={(e) => handleNumberOfCOsChange(exam._id, e.target.value)}
                          placeholder="0"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          disabled={savingCOsExamId === exam._id || (numberOfCOs[exam._id] ?? '') === (exam.numberOfCOs || 0).toString()}
                          onClick={() => handleSaveNumberOfCOs(exam._id)}
                          title="Save number of COs"
                        >
                          {savingCOsExamId === exam._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    {[0, 1, 2, 3, 4, 5].map((coIndex) => (
                      <TableCell key={coIndex} className="text-center p-2">
                        {coIndex < (exam.numberOfCOs || 0) ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            className="w-full text-center h-9"
                            value={maxMarks[exam._id]?.[coIndex] || ''}
                            onChange={(e) => handleMaxMarkChange(exam._id, coIndex, e.target.value)}
                            placeholder="0"
                          />
                        ) : (
                          <div className="h-9 flex items-center justify-center text-muted-foreground/30 bg-muted/30 rounded border border-transparent">
                            -
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {course.coPoMappingEnabled !== false && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center">
              <GitMerge className="mr-2 h-5 w-5 text-primary" />
              CO to PO Mapping Matrix
            </CardTitle>
            <CardDescription>
              Map each Course Outcome (CO) to the corresponding Program Outcomes (PO) using the checkboxes below.
            </CardDescription>
          </div>
          <Button onClick={handleSaveMapping} disabled={isSavingMapping}>
            {isSavingMapping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Mapping
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">CO \ PO</TableHead>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(po => (
                  <TableHead key={po} className="text-center w-[60px] px-1">PO{po}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[0, 1, 2, 3, 4, 5].map((coIndex) => (
                <TableRow key={coIndex} className="hover:bg-muted/30">
                  <TableCell className="font-medium">CO {coIndex + 1}</TableCell>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((poIndex) => (
                    <TableCell key={poIndex} className="text-center p-1">
                      <div className="flex justify-center items-center h-full">
                        <Checkbox
                          checked={mapping.length > 0 && mapping[coIndex]?.[poIndex] === true}
                          onCheckedChange={(checked) => handleMappingChange(coIndex, poIndex, checked as boolean)}
                          className={`h-5 w-5 transition-colors ${
                            mapping.length > 0 && mapping[coIndex]?.[poIndex] ? 'bg-primary border-primary' : 'border-muted-foreground/30 hover:border-primary/50'
                          }`}
                        />
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      <Dialog open={showManageExamsModal} onOpenChange={setShowManageExamsModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" />
              Manage CO for Exams
            </DialogTitle>
            <DialogDescription>
              Turn Course Outcome tracking on or off per exam. This is the same setting as the Add Exam / Exam Settings toggle — changes here apply everywhere for that exam.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {manageableExams.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                No exams yet.
              </div>
            ) : (
              manageableExams.map(exam => {
                const enabled = Boolean(exam.numberOfCOs && exam.numberOfCOs > 0);
                const isSaving = savingManageExamId === exam._id;
                return (
                  <div key={exam._id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{exam.displayName}</div>
                      {exam.examCategory && (
                        <div className="text-xs text-muted-foreground">{exam.examCategory}</div>
                      )}
                    </div>

                    {enabled && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="1"
                          max="6"
                          value={manageExamDraft[exam._id] ?? ''}
                          onChange={(e) => setManageExamDraft(prev => ({ ...prev, [exam._id]: e.target.value }))}
                          onBlur={() => {
                            if (manageExamDraft[exam._id] !== (exam.numberOfCOs || 0).toString()) {
                              handleSaveManageExamCOCount(exam._id);
                            }
                          }}
                          disabled={isSaving}
                          className="w-16 h-8 text-center"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={isSaving}
                      onClick={() => handleToggleExamCO(exam._id, !enabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
