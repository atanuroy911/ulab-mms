export interface DictationStudent {
  _id: string;
  studentId: string;
  name: string;
}

export interface DictationExam {
  _id: string;
  displayName: string;
  totalMarks: number;
  numberOfCOs?: number;
}

export interface DictationMark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
}

/** Values collected across the dictation steps for one student, before saving. */
export interface DraftMarkEntry {
  studentId: string;
  rawMark: string;
  coMarks: string[];
  nonCoMark: string;
}

export function emptyDraft(numberOfCOs: number): DraftMarkEntry {
  return {
    studentId: '',
    rawMark: '',
    coMarks: new Array(numberOfCOs).fill(''),
    nonCoMark: '',
  };
}
