import { Student, Exam } from '../types';

/**
 * Scale marks using bell curve technique (standard score normalization / z-score)
 * This normalizes the marks to have a mean at the center of the scaling range
 * and redistributes them based on standard deviation
 * IMPORTANT: This function works on the original unscaled marks and stores results in scaledMarks
 */
export const applyBellCurveScaling = (
  students: Student[],
  exam: Exam
): Student[] => {
  const examId = exam.id;
  const scalingValue = exam.scalingValue;

  // Get all ORIGINAL marks for this exam (not scaled marks)
  const marks = students
    .map(s => s.marks[examId])
    .filter(m => m !== undefined && m !== null && !isNaN(m)) as number[];

  if (marks.length === 0) {
    return students; // No marks to scale
  }

  // Calculate mean and standard deviation from ORIGINAL marks
  const mean = marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
  const variance = marks.reduce((sum, mark) => sum + Math.pow(mark - mean, 2), 0) / marks.length;
  const stdDev = Math.sqrt(variance);

  // If all marks are the same (stdDev = 0), set all to mean of scaling range
  if (stdDev === 0) {
    const scaledMark = scalingValue / 2;
    return students.map(student => {
      if (student.marks[examId] !== undefined) {
        return {
          ...student,
          scaledMarks: {
            ...student.scaledMarks,
            [examId]: Math.round(scaledMark * 100) / 100
          }
        };
      }
      return student;
    });
  }

  // Apply bell curve scaling based on ORIGINAL marks
  return students.map(student => {
    const rawMark = student.marks[examId]; // Use original mark
    if (rawMark === undefined || rawMark === null || isNaN(rawMark)) {
      return student;
    }

    // Calculate z-score using ORIGINAL mark
    const zScore = (rawMark - mean) / stdDev;

    // Scale to new range with mean at center
    // The formula: scaledMark = (scalingValue/2) + (zScore * scalingValue/6)
    // This puts most values (99.7% within ±3 std devs) in the range [0, scalingValue]
    const scaledMark = (scalingValue / 2) + (zScore * scalingValue / 6);

    // Clamp to [0, scalingValue] range
    const clampedMark = Math.max(0, Math.min(scalingValue, scaledMark));

    return {
      ...student,
      scaledMarks: {
        ...student.scaledMarks,
        [examId]: Math.round(clampedMark * 100) / 100 // Round to 2 decimal places
      }
    };
  });
};

/**
 * Linear Normalization (Proportional Scaling)
 * Scales marks proportionally: scaled = (raw / totalMarks) × scalingValue
 * Preserves the relative differences between marks
 */
export const applyLinearNormalization = (
  students: Student[],
  exam: Exam
): Student[] => {
  const examId = exam.id;
  const scalingValue = exam.scalingValue;
  const totalMarks = exam.totalMarks;

  return students.map(student => {
    const rawMark = student.marks[examId];
    if (rawMark === undefined || rawMark === null || isNaN(rawMark)) {
      return student;
    }

    // Simple proportion: (raw / total) × scaling
    const scaledMark = (rawMark / totalMarks) * scalingValue;
    const clampedMark = Math.max(0, Math.min(scalingValue, scaledMark));

    return {
      ...student,
      scaledMarks: {
        ...student.scaledMarks,
        [examId]: Math.round(clampedMark * 100) / 100
      }
    };
  });
};

/**
 * Min-Max Normalization
 * Scales marks to fit within [0, scalingValue] based on the actual min and max marks
 * Formula: scaled = ((raw - min) / (max - min)) × scalingValue
 * This makes the lowest mark = 0 and highest mark = scalingValue
 */
export const applyMinMaxNormalization = (
  students: Student[],
  exam: Exam
): Student[] => {
  const examId = exam.id;
  const scalingValue = exam.scalingValue;

  const marks = students
    .map(s => s.marks[examId])
    .filter(m => m !== undefined && m !== null && !isNaN(m)) as number[];

  if (marks.length === 0) return students;

  const minMark = Math.min(...marks);
  const maxMark = Math.max(...marks);
  const range = maxMark - minMark;

  // If all marks are the same
  if (range === 0) {
    const scaledMark = scalingValue / 2;
    return students.map(student => {
      if (student.marks[examId] !== undefined) {
        return {
          ...student,
          scaledMarks: {
            ...student.scaledMarks,
            [examId]: Math.round(scaledMark * 100) / 100
          }
        };
      }
      return student;
    });
  }

  return students.map(student => {
    const rawMark = student.marks[examId];
    if (rawMark === undefined || rawMark === null || isNaN(rawMark)) {
      return student;
    }

    const scaledMark = ((rawMark - minMark) / range) * scalingValue;

    return {
      ...student,
      scaledMarks: {
        ...student.scaledMarks,
        [examId]: Math.round(scaledMark * 100) / 100
      }
    };
  });
};

/**
 * Percentile-Based Scaling
 * Assigns marks based on percentile ranking
 * The top student gets scalingValue, bottom gets 0, others distributed by rank
 */
export const applyPercentileScaling = (
  students: Student[],
  exam: Exam
): Student[] => {
  const examId = exam.id;
  const scalingValue = exam.scalingValue;

  const studentsWithMarks = students
    .map((student, index) => ({
      student,
      originalIndex: index,
      mark: student.marks[examId]
    }))
    .filter(item => item.mark !== undefined && item.mark !== null && !isNaN(item.mark));

  if (studentsWithMarks.length === 0) return students;

  // Sort by marks (ascending)
  studentsWithMarks.sort((a, b) => a.mark! - b.mark!);

  // Assign percentile-based scaled marks
  const result = [...students];
  studentsWithMarks.forEach((item, rank) => {
    const percentile = studentsWithMarks.length === 1 ? 0.5 : rank / (studentsWithMarks.length - 1);
    const scaledMark = percentile * scalingValue;

    result[item.originalIndex] = {
      ...result[item.originalIndex],
      scaledMarks: {
        ...result[item.originalIndex].scaledMarks,
        [examId]: Math.round(scaledMark * 100) / 100
      }
    };
  });

  return result;
};

/**
 * Apply rounding to scaled marks (0.5 is the midpoint)
 * roundUp: true = round 0.5 up, false = round 0.5 down
 */
export const applyRounding = (
  students: Student[],
  examId: string,
  roundUp: boolean
): Student[] => {
  return students.map(student => {
    const scaledMark = student.scaledMarks?.[examId];
    if (scaledMark === undefined) return student;

    let rounded: number;
    const floor = Math.floor(scaledMark);
    const decimal = scaledMark - floor;
    
    if (roundUp) {
      // Round 0.5 up (standard rounding): >= 0.5 rounds up
      rounded = decimal >= 0.5 ? Math.ceil(scaledMark) : floor;
    } else {
      // Round 0.5 down: > 0.5 rounds up, exactly 0.5 rounds down
      rounded = decimal > 0.5 ? Math.ceil(scaledMark) : floor;
    }

    return {
      ...student,
      roundedMarks: {
        ...student.roundedMarks,
        [examId]: rounded
      }
    };
  });
};
