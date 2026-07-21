'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Plus, Settings, Trash2, Layers3 } from 'lucide-react';

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  weightage: number;
  isRequired?: boolean;
  examCategory?: string;
  numberOfCOs?: number;
  numberOfQuestions?: number;
}

interface ExamSettings {
  displayName: string;
  weightage: string;
  totalMarks: string;
  numberOfCOs: string;
  numberOfQuestions: string;
  examCategory: string;
}

interface CourseSummary {
  courseType: 'Theory' | 'Lab';
  quizAggregation?: 'average' | 'best';
  assignmentAggregation?: 'average' | 'best' | 'sum';
  quizWeightage?: number;
  assignmentWeightage?: number;
  projectWeightage?: number;
}

interface ExamsViewProps {
  exams: Exam[];
  course: CourseSummary;
  onShowExamModal: (presetCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others') => void;
  onShowExamSettings: (examId: string) => void;
  onSetExamSettings: (settings: ExamSettings) => void;
  onDeleteExam: (examId: string) => void;
  onConfigureCategory: (category: 'Quiz' | 'Assignment' | 'Project') => void;
}

export default function ExamsView({
  exams,
  course,
  onShowExamModal,
  onShowExamSettings,
  onSetExamSettings,
  onDeleteExam,
  onConfigureCategory,
}: ExamsViewProps) {
  const quizExams = exams.filter((exam) => exam.examCategory === 'Quiz');
  const assignmentExams = exams.filter((exam) => exam.examCategory === 'Assignment');
  const projectExams = exams.filter((exam) => exam.examCategory === 'Project');
  const groupedExamIds = new Set([...quizExams, ...assignmentExams, ...projectExams].map((exam) => exam._id));
  const standaloneExams = exams.filter((exam) => !groupedExamIds.has(exam._id));
  const [openGroup, setOpenGroup] = useState<'quiz' | 'assignment' | 'project' | null>('quiz');

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm backdrop-blur">
        <CardHeader className="border-b border-border/60 bg-muted/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
                Exam Management
              </CardTitle>
              <CardDescription className="mt-1">
                Configure and manage {exams.length} exam(s)
              </CardDescription>
            </div>
            <Button onClick={() => onShowExamModal()} className="sm:self-start">
              <Plus className="w-4 h-4 mr-2" />
              Add New Exam
            </Button>
          </div>
        </CardHeader>

        <CardContent className="border-b border-border/60 bg-muted/10 py-5">
          <div className="space-y-3">
            <details
              open={openGroup === 'quiz'}
              onToggle={(event) => setOpenGroup((event.currentTarget as HTMLDetailsElement).open ? 'quiz' : openGroup === 'quiz' ? null : openGroup)}
              className="group rounded-xl border border-border/60 bg-background/70 overflow-hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{quizExams.length}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers3 className="w-4 h-4" />
                      <span className="font-semibold text-foreground">Quizzes</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Aggregated using {course.quizAggregation || 'average'} over the quiz group.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{course.quizWeightage ?? 0}%</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Configure Quiz weightage/aggregation"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onConfigureCategory('Quiz');
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{openGroup === 'quiz' ? 'Collapse' : 'Expand'}</span>
                  {openGroup === 'quiz' ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </summary>
              <div className="border-t border-border/60 px-4 py-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Add multiple quiz items. Final quiz results are aggregated by the course setting.
                  </p>
                  <Button type="button" variant="outline" onClick={() => onShowExamModal('Quiz')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Quiz
                  </Button>
                </div>
                {quizExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No quiz items added yet.</p>
                ) : (
                  <div className="grid gap-2">
                    {quizExams.map((exam) => (
                      <div key={exam._id} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{exam.displayName}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline" className="font-normal">{exam.examCategory || 'Quiz'}</Badge>
                            {exam.isRequired ? <Badge variant="secondary">Required</Badge> : <Badge variant="outline">Optional</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm text-muted-foreground">
                            <div>{exam.totalMarks} marks</div>
                            <div>{exam.weightage}% group weight</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onShowExamSettings(exam._id);
                                onSetExamSettings({
                                  displayName: exam.displayName,
                                  weightage: exam.weightage.toString(),
                                  totalMarks: exam.totalMarks.toString(),
                                  numberOfCOs: exam.numberOfCOs?.toString() || '',
                                  numberOfQuestions: exam.numberOfQuestions?.toString() || '',
                                  examCategory: exam.examCategory || 'Quiz',
                                });
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => onDeleteExam(exam._id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>

            <details
              open={openGroup === 'assignment'}
              onToggle={(event) => setOpenGroup((event.currentTarget as HTMLDetailsElement).open ? 'assignment' : openGroup === 'assignment' ? null : openGroup)}
              className="group rounded-xl border border-border/60 bg-background/70 overflow-hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{assignmentExams.length}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers3 className="w-4 h-4" />
                      <span className="font-semibold text-foreground">{course.courseType === 'Lab' ? 'Continuous Lab Assessments (CLA)' : 'Assignments'}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Aggregated using {course.assignmentAggregation || 'average'} over the {course.courseType === 'Lab' ? 'CLA' : 'assignment'} group.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{course.assignmentWeightage ?? 0}%</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title={`Configure ${course.courseType === 'Lab' ? 'CLA' : 'Assignment'} weightage/aggregation`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onConfigureCategory('Assignment');
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{openGroup === 'assignment' ? 'Collapse' : 'Expand'}</span>
                  {openGroup === 'assignment' ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </summary>
              <div className="border-t border-border/60 px-4 py-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Add multiple {course.courseType === 'Lab' ? 'CLA' : 'assignment'} items. Final {course.courseType === 'Lab' ? 'CLA' : 'assignment'} results are aggregated by the course setting.
                  </p>
                  <Button type="button" variant="outline" onClick={() => onShowExamModal('Assignment')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add {course.courseType === 'Lab' ? 'CLA' : 'Assignment'}
                  </Button>
                </div>
                {assignmentExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No {course.courseType === 'Lab' ? 'CLA' : 'assignment'} items added yet.</p>
                ) : (
                  <div className="grid gap-2">
                    {assignmentExams.map((exam) => (
                      <div key={exam._id} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{exam.displayName}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline" className="font-normal">{course.courseType === 'Lab' ? 'CLA' : (exam.examCategory || 'Assignment')}</Badge>
                            {exam.isRequired ? <Badge variant="secondary">Required</Badge> : <Badge variant="outline">Optional</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm text-muted-foreground">
                            <div>{exam.totalMarks} marks</div>
                            <div>{exam.weightage}% group weight</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onShowExamSettings(exam._id);
                                onSetExamSettings({
                                  displayName: exam.displayName,
                                  weightage: exam.weightage.toString(),
                                  totalMarks: exam.totalMarks.toString(),
                                  numberOfCOs: exam.numberOfCOs?.toString() || '',
                                  numberOfQuestions: exam.numberOfQuestions?.toString() || '',
                                  examCategory: exam.examCategory || 'Assignment',
                                });
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => onDeleteExam(exam._id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>

            {/* Project Group */}
            <details
              open={openGroup === 'project'}
              onToggle={(event) => setOpenGroup((event.currentTarget as HTMLDetailsElement).open ? 'project' : openGroup === 'project' ? null : openGroup)}
              className="group rounded-xl border border-border/60 bg-background/70 overflow-hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{projectExams.length}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers3 className="w-4 h-4" />
                      <span className="font-semibold text-foreground">{course.courseType === 'Lab' ? 'OEL / CE Projects' : 'Projects'}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      All {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} marks are summed, then converted to the group weightage.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{course.projectWeightage ?? 0}%</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title={`Configure ${course.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'} weightage`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onConfigureCategory('Project');
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{openGroup === 'project' ? 'Collapse' : 'Expand'}</span>
                  {openGroup === 'project' ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </summary>
              <div className="border-t border-border/60 px-4 py-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Add multiple {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} items. Their raw marks are summed and scaled to the {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} weightage set in Course Settings.
                  </p>
                  <Button type="button" variant="outline" onClick={() => onShowExamModal('Project')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add {course.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'}
                  </Button>
                </div>
                {projectExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No {course.courseType === 'Lab' ? 'OEL/CE' : 'project'} items added yet.</p>
                ) : (
                  <div className="grid gap-2">
                    {projectExams.map((exam) => (
                      <div key={exam._id} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{exam.displayName}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline" className="font-normal">{course.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'}</Badge>
                            {exam.isRequired ? <Badge variant="secondary">Required</Badge> : <Badge variant="outline">Optional</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm text-muted-foreground">
                            <div>{exam.totalMarks} marks</div>
                            <div className="text-xs">contributes to sum</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onShowExamSettings(exam._id);
                                onSetExamSettings({
                                  displayName: exam.displayName,
                                  weightage: exam.weightage.toString(),
                                  totalMarks: exam.totalMarks.toString(),
                                  numberOfCOs: exam.numberOfCOs?.toString() || '',
                                  numberOfQuestions: exam.numberOfQuestions?.toString() || '',
                                  examCategory: 'Project',
                                });
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => onDeleteExam(exam._id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        </CardContent>

        {exams.length === 0 ? (
          <CardContent className="pt-12 pb-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
              📝
            </div>
            <CardTitle className="text-xl mb-2">No exams yet</CardTitle>
            <CardDescription className="mb-6">
              Create your first exam to start tracking student performance.
            </CardDescription>
            <Button onClick={() => onShowExamModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Exam
            </Button>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-6">Exam</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total Marks</TableHead>
                  <TableHead>Weightage</TableHead>
                  <TableHead>COs / Questions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standaloneExams.map((exam, index) => (
                  <TableRow key={exam._id} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <TableCell className="pl-6">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{exam.displayName}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {exam.examCategory && (
                            <Badge variant="outline" className="font-normal">
                              {exam.examCategory}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground capitalize">
                        {exam.examCategory || exam.displayName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{exam.totalMarks}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {exam.weightage}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {exam.numberOfCOs ? `${exam.numberOfCOs} CO${exam.numberOfCOs > 1 ? 's' : ''}` : '—'}
                        {' '}
                        /{' '}
                        {exam.numberOfQuestions ? `${exam.numberOfQuestions} Qs` : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {exam.isRequired ? (
                          <Badge variant="secondary">Required</Badge>
                        ) : (
                          <Badge variant="outline">Optional</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onShowExamSettings(exam._id);
                            onSetExamSettings({
                              displayName: exam.displayName,
                              weightage: exam.weightage.toString(),
                              totalMarks: exam.totalMarks.toString(),
                              numberOfCOs: exam.numberOfCOs?.toString() || '',
                              numberOfQuestions: exam.numberOfQuestions?.toString() || '',
                              examCategory: exam.examCategory || '',
                            });
                          }}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onDeleteExam(exam._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
