'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Upload,
  ClipboardPaste,
  ArrowRight,
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { notify } from '@/app/utils/notifications';
import {
  splitIntoGrid,
  classifyRow,
  normalizeId,
  suggestExamMatch,
  isLikelyNonMarkColumn,
  matchStudent,
  computeCoMarks,
  type RowType,
  type GridStudent,
} from '@/app/utils/bulkGridParsing';

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  numberOfCOs?: number;
  examCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
}

interface BulkPasteGridViewProps {
  students: GridStudent[];
  exams: Exam[];
  marks: Mark[];
  courseId: string;
  coPoMaxMarks?: Record<string, number[]>;
  onExamCreated: (exam: Exam) => void;
  onMarksSaved: () => void;
  onCancel: () => void;
}

type ColumnMapping =
  | { type: 'skip' }
  | { type: 'exam'; examId: string };

interface CreateDraft {
  displayName: string;
  examCategory: '' | Exam['examCategory'];
  totalMarks: string;
  weightage: string;
  numberOfCOs: string;
}

const EXAM_CATEGORIES: NonNullable<Exam['examCategory']>[] = [
  'Quiz', 'Assignment', 'Project', 'Attendance', 'MainExam', 'ClassPerformance', 'Others',
];

const PREVIEW_ROW_COUNT = 6;

function guessIdColumn(headerRow: string[], dataRows: string[][], students: GridStudent[]): number {
  let bestCol = 0;
  let bestScore = -1;
  for (let col = 0; col < headerRow.length; col++) {
    let score = 0;
    for (const row of dataRows.slice(0, 15)) {
      const cell = row[col];
      if (!cell) continue;
      const normalized = normalizeId(cell);
      if (students.some(s => normalizeId(s.studentId) === normalized)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol;
}

export default function BulkPasteGridView({
  students,
  exams,
  marks,
  courseId,
  coPoMaxMarks = {},
  onExamCreated,
  onMarksSaved,
  onCancel,
}: BulkPasteGridViewProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste');
  const [rawText, setRawText] = useState('');
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowTypeOverrides, setRowTypeOverrides] = useState<Record<number, RowType>>({});
  const [idColIndex, setIdColIndex] = useState<number | null>(null);
  const [mappings, setMappings] = useState<Record<number, ColumnMapping>>({});
  const [createDrafts, setCreateDrafts] = useState<Record<number, CreateDraft>>({});
  const [openCreateCol, setOpenCreateCol] = useState<number | null>(null);
  const [creatingCol, setCreatingCol] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [gridError, setGridError] = useState('');

  const headerRow = grid?.[0] || [];

  const rowTypes = useMemo(() => {
    if (!grid) return [];
    return grid.map((cells, i) => {
      if (i < PREVIEW_ROW_COUNT && rowTypeOverrides[i]) return rowTypeOverrides[i];
      return classifyRow(cells, idColIndex ?? 0, i);
    });
  }, [grid, rowTypeOverrides, idColIndex]);

  const dataRows = useMemo(() => {
    if (!grid) return [] as string[][];
    return grid.filter((_, i) => rowTypes[i] === 'data');
  }, [grid, rowTypes]);

  const metadataRows = useMemo(() => {
    if (!grid) return [] as string[][];
    return grid.filter((_, i) => rowTypes[i] === 'metadata');
  }, [grid, rowTypes]);

  const nameColIndexes = useMemo(() => {
    return headerRow
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => /^(first|last)\s*name$/i.test(h.trim()) || /^name$/i.test(h.trim()))
      .map(({ i }) => i);
  }, [headerRow]);

  const columnGuess = (colIndex: number): number | undefined => {
    for (const mr of metadataRows) {
      const val = parseFloat(mr[colIndex]);
      if (!isNaN(val) && val > 0) return val;
    }
    return undefined;
  };

  const loadGrid = (newGrid: string[][]) => {
    if (newGrid.length === 0) {
      setGridError('No data found.');
      return;
    }
    setGrid(newGrid);
    setGridError('');
    setRowTypeOverrides({});
    const initialIdCol = guessIdColumn(newGrid[0], newGrid.slice(1), students);
    setIdColIndex(initialIdCol);
    setMappings({});
    setCreateDrafts({});
  };

  const handlePasteChange = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setGrid(null);
      return;
    }
    loadGrid(splitIntoGrid(text));
  };

  const handleFileUpload = async (file: File) => {
    try {
      setFileName(file.name);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      const newGrid = rows
        .map(row => row.map(cell => (cell === null || cell === undefined ? '' : String(cell).trim())))
        .filter(row => row.some(cell => cell !== ''));
      loadGrid(newGrid);
    } catch (err) {
      console.error('Failed to read file', err);
      setGridError('Failed to read file. Please make sure it is a valid Excel or CSV file.');
    }
  };

  const setRowType = (rowIndex: number, type: RowType) => {
    setRowTypeOverrides(prev => ({ ...prev, [rowIndex]: type }));
  };

  const markColumns = useMemo(() => {
    if (idColIndex === null) return [] as number[];
    return headerRow
      .map((_, i) => i)
      .filter(i => i !== idColIndex);
  }, [headerRow, idColIndex]);

  const ensureDefaultMapping = (colIndex: number): ColumnMapping => {
    if (mappings[colIndex]) return mappings[colIndex];
    const header = headerRow[colIndex] || '';
    if (isLikelyNonMarkColumn(header) || nameColIndexes.includes(colIndex)) {
      return { type: 'skip' };
    }
    const suggested = suggestExamMatch(header, exams);
    return suggested ? { type: 'exam', examId: suggested } : { type: 'skip' };
  };

  const getMapping = (colIndex: number): ColumnMapping => mappings[colIndex] ?? ensureDefaultMapping(colIndex);

  const setMapping = (colIndex: number, mapping: ColumnMapping) => {
    setMappings(prev => ({ ...prev, [colIndex]: mapping }));
  };

  const openCreateForm = (colIndex: number) => {
    const header = headerRow[colIndex] || '';
    const guessedTotal = columnGuess(colIndex);
    setCreateDrafts(prev => ({
      ...prev,
      [colIndex]: prev[colIndex] || {
        displayName: header,
        examCategory: '',
        totalMarks: guessedTotal ? String(guessedTotal) : '',
        weightage: '0',
        numberOfCOs: '',
      },
    }));
    setOpenCreateCol(colIndex);
  };

  const updateDraft = (colIndex: number, patch: Partial<CreateDraft>) => {
    setCreateDrafts(prev => ({ ...prev, [colIndex]: { ...prev[colIndex], ...patch } as CreateDraft }));
  };

  const submitCreateExam = async (colIndex: number) => {
    const draft = createDrafts[colIndex];
    if (!draft || !draft.displayName.trim()) {
      notify.error('Exam name is required');
      return;
    }
    const totalMarksNum = parseFloat(draft.totalMarks);
    if (isNaN(totalMarksNum) || totalMarksNum <= 0) {
      notify.error('Total marks must be greater than 0');
      return;
    }
    const isInheritedWeightage = draft.examCategory === 'Quiz' || draft.examCategory === 'Assignment';
    const weightageNum = parseFloat(draft.weightage);
    if (!isInheritedWeightage && (isNaN(weightageNum) || weightageNum < 0 || weightageNum > 100)) {
      notify.error('Weightage must be between 0 and 100');
      return;
    }

    setCreatingCol(colIndex);
    try {
      const body: Record<string, unknown> = {
        courseId,
        displayName: draft.displayName.trim(),
        totalMarks: totalMarksNum,
      };
      if (draft.examCategory) body.examCategory = draft.examCategory;
      if (!isInheritedWeightage) body.weightage = weightageNum;
      if (draft.numberOfCOs) {
        const n = parseInt(draft.numberOfCOs, 10);
        if (!isNaN(n) && n > 0) body.numberOfCOs = n;
      }

      const response = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create exam');
      }

      const { exam } = await response.json();
      onExamCreated(exam);
      setMapping(colIndex, { type: 'exam', examId: exam._id });
      setOpenCreateCol(null);
      notify.success(`Exam "${exam.displayName}" created`);
    } catch (err: any) {
      notify.error(err.message || 'Failed to create exam');
    } finally {
      setCreatingCol(null);
    }
  };

  interface PreviewRow {
    idCellRaw: string;
    student?: GridStudent;
    rawMarkText: string;
    rawMarkNum?: number;
    existingMark?: number;
    error?: string;
    skipped?: boolean;
  }

  const parsedByColumn = useMemo(() => {
    const result: Record<number, PreviewRow[]> = {};
    if (idColIndex === null) return result;

    for (const colIndex of markColumns) {
      const mapping = getMapping(colIndex);
      if (mapping.type !== 'exam') continue;
      const exam = exams.find(e => e._id === mapping.examId);
      if (!exam) continue;
      const examMarks = marks.filter(m => m.examId === exam._id);

      result[colIndex] = dataRows.map(row => {
        const idCellRaw = row[idColIndex] || '';
        const rawMarkText = (row[colIndex] || '').trim();
        if (!rawMarkText) {
          return { idCellRaw, rawMarkText, skipped: true };
        }

        const nameCells = nameColIndexes.map(i => row[i] || '');
        const student = matchStudent(idCellRaw, nameCells, students);
        const rawMarkNum = parseFloat(rawMarkText);
        const existingMark = student ? examMarks.find(m => m.studentId === student._id)?.rawMark : undefined;

        let error: string | undefined;
        if (!student) {
          error = `No student found for "${idCellRaw}"`;
        } else if (isNaN(rawMarkNum)) {
          error = 'Invalid mark value';
        } else if (rawMarkNum < 0 || rawMarkNum > exam.totalMarks) {
          error = `Mark must be between 0 and ${exam.totalMarks}`;
        }

        return {
          idCellRaw,
          student,
          rawMarkText,
          rawMarkNum: isNaN(rawMarkNum) ? undefined : rawMarkNum,
          existingMark,
          error,
        };
      });
    }
    return result;
  }, [markColumns, mappings, idColIndex, dataRows, students, exams, marks, nameColIndexes]);

  const mappedColumns = markColumns.filter(c => getMapping(c).type === 'exam');

  const totalValidRows = mappedColumns.reduce((sum, c) => {
    const rows = parsedByColumn[c] || [];
    return sum + rows.filter(r => !r.error && !r.skipped).length;
  }, 0);

  const handleSaveAll = async () => {
    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const colIndex of mappedColumns) {
        const mapping = getMapping(colIndex);
        if (mapping.type !== 'exam') continue;
        const exam = exams.find(e => e._id === mapping.examId);
        if (!exam) continue;

        const rows = (parsedByColumn[colIndex] || []).filter(r => !r.error && !r.skipped && r.student && r.rawMarkNum !== undefined);

        for (const row of rows) {
          const numberOfCOs = exam.numberOfCOs || 0;
          const examMaxMarks = coPoMaxMarks[exam._id];
          const { coMarks, nonCoMark } = computeCoMarks(row.rawMarkNum!, numberOfCOs, exam.totalMarks, examMaxMarks);

          const response = await fetch('/api/marks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              courseId,
              studentId: row.student!._id,
              examId: exam._id,
              rawMark: row.rawMarkNum,
              coMarks,
              nonCoMark,
            }),
          });

          if (response.ok) successCount++;
          else failCount++;
        }
      }

      if (successCount > 0) {
        notify.mark.bulkSaved(successCount);
        onMarksSaved();
      } else {
        notify.mark.bulkSaveError();
      }
      if (failCount > 0 && successCount > 0) {
        notify.mark.bulkSaveError(`${failCount} mark(s) failed to save`);
      }
    } catch (err) {
      console.error('Error saving grid-mapped marks:', err);
      notify.mark.bulkSaveError();
    } finally {
      setSaving(false);
    }
  };

  const canGoToStep2 = grid !== null && idColIndex !== null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Step indicator */}
      <div className="px-6 pt-4 flex items-center gap-2 text-xs">
        {[
          { n: 1, label: 'Get data in' },
          { n: 2, label: 'Map columns' },
          { n: 3, label: 'Preview & save' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
                step === s.n
                  ? 'bg-blue-600 text-white'
                  : step > s.n
                    ? 'bg-emerald-900/40 text-emerald-400'
                    : 'bg-gray-800 text-gray-500'
              }`}
            >
              {step > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{s.n}</span>}
              {s.label}
            </div>
            {i < 2 && <div className="w-6 h-px bg-gray-700" />}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="inline-flex rounded-lg border border-gray-700 bg-gray-900/60 p-1">
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  inputMode === 'paste' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <ClipboardPaste className="w-4 h-4" />
                Paste data
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  inputMode === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload file
              </button>
            </div>

            {inputMode === 'paste' ? (
              <textarea
                value={rawText}
                onChange={(e) => handlePasteChange(e.target.value)}
                placeholder="Paste your gradebook here (e.g. copied from Google Sheets or Excel)"
                rows={8}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500 font-mono text-sm"
              />
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-700 rounded-lg py-10 cursor-pointer hover:border-gray-500 transition-colors">
                <Upload className="w-8 h-8 text-gray-500" />
                <span className="text-sm text-gray-300">{fileName || 'Click to choose a .xlsx, .xls, or .csv file'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </label>
            )}

            {gridError && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{gridError}</div>
            )}

            {grid && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-200">Confirm row types &amp; student ID column</h4>
                <p className="text-xs text-gray-500">
                  Check the first few rows below. Mark any header/metadata rows (like a &quot;Date&quot; or &quot;Points&quot; row) so only real student rows are treated as data.
                </p>
                <div className="rounded-lg border border-gray-700 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <tbody className="divide-y divide-gray-800">
                      {grid.slice(0, PREVIEW_ROW_COUNT).map((row, i) => (
                        <tr key={i} className={rowTypes[i] === 'header' ? 'bg-blue-900/10' : rowTypes[i] === 'metadata' ? 'bg-amber-900/10' : ''}>
                          <td className="px-2 py-1.5 w-36">
                            <select
                              value={rowTypes[i]}
                              onChange={(e) => setRowType(i, e.target.value as RowType)}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-gray-200 text-xs"
                            >
                              <option value="header">Header</option>
                              <option value="metadata">Metadata (ignored)</option>
                              <option value="data">Data</option>
                            </select>
                          </td>
                          {row.map((cell, j) => (
                            <td key={j} className={`px-2 py-1.5 text-gray-300 whitespace-nowrap ${j === idColIndex ? 'bg-emerald-900/20' : ''}`}>
                              {cell || <span className="text-gray-600">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-300 shrink-0">Student ID column:</label>
                  <select
                    value={idColIndex ?? 0}
                    onChange={(e) => setIdColIndex(parseInt(e.target.value, 10))}
                    className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-sm"
                  >
                    {headerRow.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-500">{dataRows.length} data row(s) detected</span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-200">Map each column to an exam</h4>
            <p className="text-xs text-gray-500">
              Columns that look like name/email/date/points are skipped by default. Choose an existing exam, create a new one, or skip a column.
            </p>
            <div className="space-y-2">
              {markColumns.map((colIndex) => {
                const header = headerRow[colIndex] || `Column ${colIndex + 1}`;
                const mapping = getMapping(colIndex);
                const samples = dataRows.slice(0, 3).map(r => r[colIndex]).filter(Boolean);
                const draft = createDrafts[colIndex];
                const isInheritedWeightage = draft?.examCategory === 'Quiz' || draft?.examCategory === 'Assignment';

                return (
                  <div key={colIndex} className="border border-gray-700 rounded-lg p-3 bg-gray-900/40">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-200 truncate">{header}</div>
                        {samples.length > 0 && (
                          <div className="text-xs text-gray-500 truncate">e.g. {samples.join(', ')}</div>
                        )}
                      </div>
                      <select
                        value={mapping.type === 'exam' ? mapping.examId : 'skip'}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'skip') {
                            setMapping(colIndex, { type: 'skip' });
                            setOpenCreateCol(prev => (prev === colIndex ? null : prev));
                          } else if (value === 'create') {
                            openCreateForm(colIndex);
                          } else {
                            setMapping(colIndex, { type: 'exam', examId: value });
                            setOpenCreateCol(prev => (prev === colIndex ? null : prev));
                          }
                        }}
                        className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-sm min-w-[220px]"
                      >
                        <option value="skip">Skip this column</option>
                        {exams.map(exam => (
                          <option key={exam._id} value={exam._id}>{exam.displayName}</option>
                        ))}
                        <option value="create">+ Create new exam…</option>
                      </select>
                    </div>

                    {openCreateCol === colIndex && draft && (
                      <div className="mt-3 p-3 rounded-lg border border-blue-800/50 bg-blue-950/20 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs text-blue-300 font-medium">
                          <Sparkles className="w-3.5 h-3.5" />
                          New exam
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="text-xs text-gray-400">Exam name</label>
                            <Input
                              value={draft.displayName}
                              onChange={(e) => updateDraft(colIndex, { displayName: e.target.value })}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Category</label>
                            <select
                              value={draft.examCategory || ''}
                              onChange={(e) => updateDraft(colIndex, { examCategory: e.target.value as CreateDraft['examCategory'] })}
                              className="w-full h-8 mt-1 bg-gray-900 border border-gray-700 rounded px-2 text-gray-200 text-sm"
                            >
                              <option value="">None</option>
                              {EXAM_CATEGORIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Total marks</label>
                            <Input
                              type="number"
                              min="0"
                              value={draft.totalMarks}
                              onChange={(e) => updateDraft(colIndex, { totalMarks: e.target.value })}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                          {!isInheritedWeightage && (
                            <div>
                              <label className="text-xs text-gray-400">Weightage (%)</label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={draft.weightage}
                                onChange={(e) => updateDraft(colIndex, { weightage: e.target.value })}
                                className="h-8 text-sm mt-1"
                              />
                            </div>
                          )}
                          <div>
                            <label className="text-xs text-gray-400">Number of COs (optional)</label>
                            <Input
                              type="number"
                              min="0"
                              max="6"
                              value={draft.numberOfCOs}
                              onChange={(e) => updateDraft(colIndex, { numberOfCOs: e.target.value })}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setOpenCreateCol(null)} disabled={creatingCol === colIndex}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => submitCreateExam(colIndex)}
                            disabled={creatingCol === colIndex}
                          >
                            {creatingCol === colIndex ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Create exam
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {mappedColumns.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground border-2 border-dashed border-gray-700 rounded-lg text-gray-400">
                No columns mapped to an exam yet. Go back and map at least one column.
              </div>
            ) : (
              mappedColumns.map(colIndex => {
                const exam = exams.find(e => e._id === (getMapping(colIndex) as { examId: string }).examId);
                const rows = parsedByColumn[colIndex] || [];
                const validRows = rows.filter(r => !r.error && !r.skipped);
                const errorRows = rows.filter(r => r.error);
                const overwriteRows = validRows.filter(r => r.existingMark !== undefined);

                return (
                  <div key={colIndex} className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-200">{exam?.displayName || headerRow[colIndex]}</h4>
                      <div className="text-xs">
                        <span className="text-emerald-400">{validRows.length} valid</span>
                        {overwriteRows.length > 0 && <span className="text-blue-400 ml-2">{overwriteRows.length} will overwrite</span>}
                        {errorRows.length > 0 && <span className="text-amber-400 ml-2">{errorRows.length} error(s)</span>}
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-900 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Student</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Old Mark</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">New Mark</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {rows.filter(r => !r.skipped).map((row, idx) => (
                            <tr key={idx} className={row.error ? 'bg-amber-900/10' : row.existingMark !== undefined ? 'bg-blue-900/10' : ''}>
                              <td className="px-3 py-2 text-gray-200">
                                {row.student ? `${row.student.studentId} · ${row.student.name}` : row.idCellRaw || '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-400">{row.existingMark ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-200">{row.rawMarkText || '—'}</td>
                              <td className="px-3 py-2">
                                {row.error ? (
                                  <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
                                    <AlertTriangle className="w-3 h-3" /> {row.error}
                                  </span>
                                ) : row.existingMark !== undefined ? (
                                  <span className="text-blue-400 text-xs">↻ Will overwrite</span>
                                ) : (
                                  <span className="text-emerald-400 text-xs">✓ New mark</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-700 flex gap-3">
        <Button onClick={step === 1 ? onCancel : () => setStep((step - 1) as 1 | 2)} variant="outline" disabled={saving} className="flex-1">
          {step === 1 ? (
            'Cancel'
          ) : (
            <>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </>
          )}
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep((step + 1) as 2 | 3)}
            disabled={step === 1 && !canGoToStep2}
            className="flex-1"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSaveAll}
            disabled={saving || totalValidRows === 0}
            className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save {totalValidRows} Mark{totalValidRows !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
