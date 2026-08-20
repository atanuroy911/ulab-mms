import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, GitMerge } from 'lucide-react';
import { toast } from 'sonner';

interface CoPoViewProps {
  course: any;
  exams: any[];
  onUpdate: () => void;
}

export default function CoPoView({ course, exams, onUpdate }: CoPoViewProps) {
  const [maxMarks, setMaxMarks] = useState<Record<string, number[]>>({});
  const [mapping, setMapping] = useState<boolean[][]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Filter exams that have COs enabled. Project-category exams are excluded here — they share
  // one combined CO configuration (set via a Project exam's gear icon) instead of a per-exam one.
  const examsWithCOs = exams.filter(e => e.numberOfCOs && e.numberOfCOs >= 1 && e.examCategory !== 'Project');
  const projectNumberOfCOs = course.coPoMapping?.projectNumberOfCOs || 0;
  const hasProjectExams = exams.some(e => e.examCategory === 'Project');

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/courses/${course._id}/copo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMarks, mapping }),
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
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">CO-PO Mapping</h3>
          <p className="text-muted-foreground">Configure CO maximum marks and map them to Program Outcomes.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Mapping
        </Button>
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
                <>{projectNumberOfCOs} CO(s) configured, shared across every {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} exam and scaled to the {Number(course.projectWeightage || 0)}% weightage. Configure from any project exam's gear icon in the Exams tab.</>
              ) : (
                <>Not configured yet — open any {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} exam's gear icon in the Exams tab to set combined COs.</>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GitMerge className="mr-2 h-5 w-5 text-primary" />
            Maximum CO Marks per Exam
          </CardTitle>
          <CardDescription>
            Enter the maximum attainable marks for each Course Outcome in the relevant exams.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {examsWithCOs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              No exams found with Course Outcomes configured. Please add COs to your exams first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Exam Name</TableHead>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GitMerge className="mr-2 h-5 w-5 text-primary" />
            CO to PO Mapping Matrix
          </CardTitle>
          <CardDescription>
            Map each Course Outcome (CO) to the corresponding Program Outcomes (PO) using the checkboxes below.
          </CardDescription>
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
    </div>
  );
}
