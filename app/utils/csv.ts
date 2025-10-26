import { Student } from '../types';

export const parseCSV = (csvText: string): Student[] => {
  const lines = csvText.trim().split('\n');
  const students: Student[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma, handling quoted values
    const parts = line.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''));
    
    if (parts.length >= 2) {
      const [id, name] = parts;
      if (id && name) {
        students.push({
          id,
          name,
          marks: {}
        });
      }
    }
  }

  return students;
};

export const generateCSV = (students: Student[], exams: { id: string; name: string }[]): string => {
  // Header row - include raw, scaled, and rounded columns for each exam
  let csv = 'Student ID,Student Name';
  exams.forEach(exam => {
    csv += `,${exam.name} (Raw),${exam.name} (Scaled),${exam.name} (Rounded)`;
  });
  csv += '\n';

  // Data rows
  students.forEach(student => {
    csv += `${student.id},${student.name}`;
    exams.forEach(exam => {
      const rawMark = student.marks[exam.id];
      const scaledMark = student.scaledMarks?.[exam.id];
      const roundedMark = student.roundedMarks?.[exam.id];
      csv += `,${rawMark !== undefined ? rawMark : ''}`;
      csv += `,${scaledMark !== undefined ? scaledMark : ''}`;
      csv += `,${roundedMark !== undefined ? roundedMark : ''}`;
    });
    csv += '\n';
  });

  return csv;
};

export const downloadCSV = (csvContent: string, filename: string): void => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
