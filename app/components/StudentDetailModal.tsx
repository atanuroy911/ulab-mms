'use client';

import { 
  calculateLetterGrade, 
  getGradeDisplay,
  getGradeColor,
  getGradeBgColor 
} from '@/app/utils/grading';

interface Student {
  _id: string;
  studentId: string;
  name: string;
  withdrawn?: boolean;
}

interface Exam {
  _id: string;
  displayName: string;
  examType: 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom';
  totalMarks: number;
  weightage: number;
  numberOfCOs?: number;
  examCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
  coMarks?: number[];
  weightedMark?: number;
}

interface Course {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
  courseType: 'Theory' | 'Lab';
  showFinalGrade: boolean;
  quizAggregation?: 'average' | 'best';
  assignmentAggregation?: 'average' | 'best' | 'sum';
  quizWeightage?: number;
  assignmentWeightage?: number;
  gradingScale?: string;
}

interface StudentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  exams: Exam[];
  marks: Mark[];
  course: Course;
}

export default function StudentDetailModal({
  isOpen,
  onClose,
  student,
  exams,
  marks,
  course,
}: StudentDetailModalProps) {
  if (!isOpen || !student) return null;

  const studentMarks = marks.filter(m => m.studentId === student._id);

  const getExamPercentage = (rawMark: number, totalMarks: number) => {
    if (!totalMarks || totalMarks <= 0) return 0;
    return (rawMark / totalMarks) * 100;
  };

  // Helper function to get aggregated mark for Quiz or Assignment
  const getAggregatedMark = (category: 'Quiz' | 'Assignment'): Mark | { rawMark: number; isAggregated: boolean; examId?: string } | null => {
    const categoryExams = exams.filter(exam => exam.examCategory === category);
    
    if (categoryExams.length === 0) return null;

    const categoryMarks = categoryExams
      .map(exam => studentMarks.find(m => m.examId === exam._id))
      .filter(mark => mark !== undefined);

    if (categoryMarks.length === 0) return null;

    const aggregationMethod = category === 'Quiz' 
      ? course?.quizAggregation || 'average'
      : course?.assignmentAggregation || 'average';

    const categoryWeightage = category === 'Quiz'
      ? Number(course?.quizWeightage || 0)
      : Number(course?.assignmentWeightage || 0);

    if (aggregationMethod === 'best') {
      let bestMark = categoryMarks[0];
      let bestValue = -1;

      categoryMarks.forEach(mark => {
        const exam = categoryExams.find(e => e._id === mark!.examId);
        if (exam) {
          const percentage = getExamPercentage(mark!.rawMark, exam.totalMarks);
          if (percentage > bestValue) {
            bestValue = percentage;
            bestMark = mark!;
          }
        }
      });

      const exam = categoryExams.find(e => e._id === bestMark!.examId);
      if (exam) {
        const weightedScore = (getExamPercentage(bestMark!.rawMark, exam.totalMarks) * categoryWeightage) / 100;
        return {
          rawMark: weightedScore,
          isAggregated: true,
          examId: bestMark!.examId,
        };
      }

      return null;
    } else if (aggregationMethod === 'sum') {
      const sumRaw = categoryMarks.reduce((sum, mark) => sum + mark!.rawMark, 0);
      const sumTotal = categoryMarks.reduce((sum, mark) => {
        const exam = categoryExams.find(e => e._id === mark!.examId);
        return exam ? sum + exam.totalMarks : sum;
      }, 0);

      const weightedSum = sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;

      return {
        rawMark: weightedSum,
        isAggregated: true,
      };
    } else {
      const averagePercentage = categoryMarks.reduce((sum, mark) => {
        const exam = categoryExams.find(e => e._id === mark!.examId);
        if (!exam) return sum;
        return sum + getExamPercentage(mark!.rawMark, exam.totalMarks);
      }, 0) / categoryMarks.length;

      const weightedScore = (averagePercentage * categoryWeightage) / 100;

      return {
        rawMark: weightedScore,
        isAggregated: true,
      };
    }
  };

  // Calculate final grade with breakdown
  const calculateFinalGrade = (): { total: number; breakdown: Array<{ name: string; mark: number; totalMarks: number; weightage: number; contribution: number; isAggregated?: boolean }> } => {
    const breakdown: Array<{ name: string; mark: number; totalMarks: number; weightage: number; contribution: number; isAggregated?: boolean }> = [];
    let totalContribution = 0;

    const hasQuizzes = exams.some(exam => exam.examCategory === 'Quiz');
    const hasAssignments = exams.some(exam => exam.examCategory === 'Assignment');

    // Process individual exams (non-Quiz, non-Assignment)
    exams.forEach(exam => {
      if (exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment') {
        return;
      }

      const mark = studentMarks.find(m => m.examId === exam._id);
      if (mark) {
        const contribution = mark.weightedMark !== undefined && mark.weightedMark !== null
          ? mark.weightedMark
          : (mark.rawMark / exam.totalMarks) * exam.weightage;
        
        breakdown.push({
          name: exam.displayName,
          mark: mark.rawMark,
          totalMarks: exam.totalMarks,
          weightage: exam.weightage,
          contribution: contribution,
        });
        
        totalContribution += contribution;
      }
    });

    // Add Quiz aggregated column if exists
    if (hasQuizzes && course?.quizWeightage) {
      const aggMark = getAggregatedMark('Quiz');
      if (aggMark) {
        const totalMarks = Number(course.quizWeightage);
        const contribution = aggMark.rawMark;
        
        breakdown.push({
          name: 'Quiz (Aggregated)',
          mark: contribution,
          totalMarks: totalMarks,
          weightage: totalMarks,
          contribution: contribution,
          isAggregated: true,
        });
        
        totalContribution += contribution;
      }
    }

    // Add Assignment aggregated column if exists
    if (hasAssignments && course?.assignmentWeightage) {
      const aggMark = getAggregatedMark('Assignment');
      if (aggMark) {
        const totalMarks = Number(course.assignmentWeightage);
        const contribution = aggMark.rawMark;
        
        breakdown.push({
          name: `${course?.courseType === 'Lab' ? 'Assessment' : 'Assignment'} (Aggregated)`,
          mark: contribution,
          totalMarks: totalMarks,
          weightage: totalMarks,
          contribution: contribution,
          isAggregated: true,
        });

        totalContribution += contribution;
      }
    }

    return {
      total: totalContribution,
      breakdown: breakdown,
    };
  };

  // Calculate grade projections
  const calculateGradeProjections = () => {
    const gradeData = calculateFinalGrade();
    const completedWeightage = gradeData.breakdown.reduce((sum, item) => sum + item.weightage, 0);
    const totalWeightage = exams.reduce((sum, exam) => {
      if (exam.examCategory === 'Quiz' && course?.quizWeightage) return sum;
      if (exam.examCategory === 'Assignment' && course?.assignmentWeightage) return sum;
      return sum + exam.weightage;
    }, 0) + (course?.quizWeightage || 0) + (course?.assignmentWeightage || 0);
    const remainingWeightage = totalWeightage - completedWeightage;

    if (remainingWeightage <= 0) {
      return null; // All exams completed
    }

    const targets = [
      { grade: 'A+', min: 95, color: 'green' },
      { grade: 'A', min: 85, color: 'green' },
      { grade: 'A-', min: 80, color: 'blue' },
      { grade: 'B+', min: 75, color: 'blue' },
      { grade: 'B', min: 70, color: 'blue' },
      { grade: 'B-', min: 65, color: 'yellow' },
      { grade: 'C+', min: 60, color: 'yellow' },
      { grade: 'C-', min: 55, color: 'orange' },
      { grade: 'D', min: 50, color: 'orange' },
    ];

    const estimates = targets.map(target => {
      const neededTotal = target.min;
      const neededFromRemaining = neededTotal - gradeData.total;
      const averageNeeded = remainingWeightage > 0 ? (neededFromRemaining / remainingWeightage) * 100 : 0;
      
      return {
        grade: target.grade,
        targetPercentage: target.min,
        averageNeeded: Math.max(0, averageNeeded),
        achievable: averageNeeded <= 100 && averageNeeded >= 0,
        color: target.color,
      };
    });

    return {
      completedWeightage,
      totalWeightage,
      remainingWeightage,
      currentPoints: gradeData.total,
      estimates: estimates.filter(e => e.achievable),
    };
  };

  const gradeData = calculateFinalGrade();
  const letterGrade = gradeData.total > 0 ? calculateLetterGrade(gradeData.total, course?.gradingScale) : null;
  const projections = calculateGradeProjections();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-800/80 rounded-2xl shadow-2xl max-w-7xl w-full border border-gray-700/50 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">{student.name}</h2>
            <p className="text-sm text-gray-400 mt-1">Student ID: {student.studentId}</p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all font-medium text-sm"
          >
            Close
          </button>
        </div>

        {/* Grade Summary Card - Top for mobile, Right side for desktop */}
        {studentMarks.length > 0 && gradeData.breakdown.length > 0 && (
          <div className="mb-6">
            <div className="lg:grid lg:grid-cols-3 lg:gap-6">
              {/* Main Grade Display - Spans full width on mobile, right column on desktop */}
              <div className="lg:col-span-1 lg:order-2 mb-6 lg:mb-0">
                <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 rounded-xl p-6 border border-purple-700/50 sticky top-0">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
                    <span>🎯</span>
                    <span>Your Estimated Grade</span>
                  </h3>
                  
                  {/* Big Grade Display */}
                  <div className="text-center mb-6">
                    {student.withdrawn ? (
                      <div>
                        <div className="text-6xl font-bold mb-2 text-red-500">W</div>
                        <div className="text-sm text-gray-400 mb-1">Withdrawn</div>
                        <div className="text-3xl font-bold text-cyan-300 mb-1">
                          {gradeData.total.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          Final standing score
                        </div>
                      </div>
                    ) : letterGrade ? (
                      <div>
                        <div className={`text-6xl font-bold mb-2 ${getGradeColor(letterGrade.letter)}`}>
                          {letterGrade.letter}
                          {letterGrade.modifier === '1' ? '-' : letterGrade.modifier === '2' ? '+' : ''}
                        </div>
                        <div className="text-sm text-gray-400 mb-1">
                          {getGradeDisplay(letterGrade.letter, letterGrade.modifier)}
                        </div>
                        <div className="text-3xl font-bold text-cyan-300 mb-1">
                          {gradeData.total.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          Current weighted score
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-blue-900/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-300">
                        {studentMarks.length}
                      </div>
                      <div className="text-xs text-gray-400">Exams Taken</div>
                    </div>
                    <div className="bg-emerald-900/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-300">
                        {exams.length - studentMarks.length}
                      </div>
                      <div className="text-xs text-gray-400">Remaining</div>
                    </div>
                  </div>

                  {/* Grade Projections */}
                  {projections && projections.estimates.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                        <span>🎓</span>
                        <span>Grade Targets</span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {projections.estimates.slice(0, 6).map((est, idx) => (
                          <div 
                            key={idx} 
                            className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-lg font-bold ${
                                est.color === 'green' ? 'text-green-400' :
                                est.color === 'blue' ? 'text-blue-400' :
                                est.color === 'yellow' ? 'text-yellow-400' :
                                'text-orange-400'
                              }`}>
                                {est.grade}
                              </span>
                              <span className="text-xl font-bold text-cyan-300">
                                {est.averageNeeded.toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Need avg {est.averageNeeded.toFixed(1)}% in remaining exams
                            </div>
                            <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
                              <div 
                                className={`h-1.5 rounded-full ${
                                  est.color === 'green' ? 'bg-green-500' :
                                  est.color === 'blue' ? 'bg-blue-500' :
                                  est.color === 'yellow' ? 'bg-yellow-500' :
                                  'bg-orange-500'
                                }`}
                                style={{ width: `${Math.min(est.averageNeeded, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 p-2 bg-cyan-900/20 border border-cyan-700/50 rounded text-xs text-cyan-300">
                        💡 These are the average percentages you need in remaining exams to achieve each grade
                      </div>
                    </div>
                  )}

                  {!projections && (
                    <div className="mt-4 p-3 bg-green-900/20 border border-green-700/50 rounded-lg text-center">
                      <div className="text-3xl mb-2">🎉</div>
                      <div className="text-sm text-green-300 font-medium">
                        All exams completed!
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        This is your final grade
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Grade Breakdown - Left column on desktop */}
              <div className="lg:col-span-2 lg:order-1">
                <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl p-4 border border-blue-700/50 mb-4">
                  <h4 className="text-base font-semibold text-gray-100 mb-3 flex items-center gap-2">
                    <span>📊</span>
                    <span>Grade Breakdown</span>
                  </h4>
                  <div className="space-y-2">
                    {gradeData.breakdown.map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between text-xs p-2 rounded ${
                        item.isAggregated ? 'bg-amber-900/20 border border-amber-700/30' : 'bg-gray-800/50'
                      }`}>
                        <div className="flex items-center gap-2 flex-1">
                          {item.isAggregated && <span>📊</span>}
                          <span className="text-gray-300">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-blue-400">
                            {item.mark.toFixed(2)}/{item.totalMarks}
                          </span>
                          <span className="text-purple-400">
                            {((item.mark / item.totalMarks) * 100).toFixed(1)}%
                          </span>
                          <span className="text-gray-500">×</span>
                          <span className="text-cyan-400">{item.weightage}%</span>
                          <span className="text-gray-500">=</span>
                          <span className="text-green-400 font-semibold min-w-[3rem] text-right">
                            {item.contribution.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm p-2 bg-green-900/20 border border-green-700/50 rounded font-semibold mt-2">
                      <span className="text-gray-200">Total Points:</span>
                      <span className="text-green-300 text-base">{gradeData.total.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Exam Details Section */}
        <div>
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <span>📝</span>
            <span>Exam Details</span>
          </h3>

        {studentMarks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-gray-700/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">📝</span>
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Marks Yet</h3>
            <p className="text-gray-500">This student has no marks recorded.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map(exam => {
              const mark = studentMarks.find(m => m.examId === exam._id);
              
              if (!mark) {
                return (
                  <div key={exam._id} className="p-4 rounded-lg border border-gray-700/50 bg-gray-900/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-100">{exam.displayName}</div>
                        <div className="text-sm text-gray-400 mt-1">
                          Total: {exam.totalMarks} marks • Weightage: {exam.weightage}%
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 italic">Not recorded</div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={exam._id} className="p-4 rounded-lg border border-blue-700/50 bg-blue-900/20">
                  <div className="mb-3">
                    <div className="font-semibold text-gray-100 mb-1">{exam.displayName}</div>
                    <div className="text-sm text-gray-400">
                      Total: {exam.totalMarks} marks • Weightage: {exam.weightage}%
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div className="p-3 rounded-lg bg-blue-900/30 border border-blue-700/50">
                      <div className="text-xs text-gray-400 mb-1">Raw Mark</div>
                      <div className="text-2xl font-bold text-blue-300">
                        {mark.rawMark}
                        <span className="text-sm text-gray-400 ml-1">/ {exam.totalMarks}</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
                      <div className="text-xs text-gray-400 mb-1">Weighted Mark</div>
                      <div className="text-2xl font-bold text-emerald-300">
                        {(mark.weightedMark !== undefined && mark.weightedMark !== null
                          ? mark.weightedMark
                          : (mark.rawMark / exam.totalMarks) * exam.weightage
                        ).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* CO Marks Breakdown */}
                  {mark.coMarks && mark.coMarks.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-gray-700/30 border border-gray-600/50">
                      <div className="text-sm font-medium text-gray-300 mb-2">CO-wise Marks</div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        {mark.coMarks.map((coMark, idx) => (
                          <div key={idx} className="text-center">
                            <div className="text-xs text-gray-400">CO{idx + 1}</div>
                            <div className="text-lg font-semibold text-cyan-300">{coMark}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Total: {mark.coMarks.reduce((sum, cm) => sum + cm, 0).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Percentage */}
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-gray-400">Percentage:</span>
                    <span className="font-semibold text-gray-200">
                      {((mark.rawMark / exam.totalMarks) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* Overall Summary */}
        {studentMarks.length > 0 && (
          <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50">
            <h3 className="text-lg font-semibold text-gray-100 mb-3">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-gray-400">Exams Completed</div>
                <div className="text-xl font-bold text-blue-300">
                  {studentMarks.length} / {exams.length}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Total Raw Marks</div>
                <div className="text-xl font-bold text-emerald-300">
                  {studentMarks.reduce((sum, m) => sum + m.rawMark, 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Average Percentage</div>
                <div className="text-xl font-bold text-purple-300">
                  {studentMarks.length > 0
                    ? (
                        studentMarks.reduce((sum, m) => {
                          const exam = exams.find(e => e._id === m.examId);
                          return sum + (exam ? (m.rawMark / exam.totalMarks) * 100 : 0);
                        }, 0) / studentMarks.length
                      ).toFixed(2)
                    : 0}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Weighted Score</div>
                <div className="text-xl font-bold text-cyan-300">
                  {studentMarks.reduce((sum, m) => {
                    const exam = exams.find(e => e._id === m.examId);
                    if (!exam) return sum;
                    const weighted = m.weightedMark !== undefined && m.weightedMark !== null
                      ? m.weightedMark
                      : (m.rawMark / exam.totalMarks) * exam.weightage;
                    return sum + weighted;
                  }, 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
