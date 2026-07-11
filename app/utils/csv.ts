import { Student } from '../types';

// Splits a single "ID <something> Name" line into [id, name], tolerating
// comma-, hyphen-, or plain whitespace-separated input (e.g. pasted straight
// from a spreadsheet, or reformatted by an LLM). Tries the least ambiguous
// separator first so IDs that themselves contain hyphens (e.g. "2021-1-60-001")
// aren't split on their own internal hyphens.
function splitIdAndName(line: string): [string, string] | null {
  const stripQuotes = (part: string) => part.trim().replace(/^["']|["']$/g, '');

  if (line.includes(',')) {
    const [id, ...rest] = line.split(',');
    const name = rest.join(',');
    if (id.trim() && name.trim()) return [stripQuotes(id), stripQuotes(name)];
  }

  // Hyphen surrounded by spaces reads unambiguously as a separator, unlike a
  // bare hyphen which is often just part of the ID itself.
  if (/\s-\s/.test(line)) {
    const idx = line.search(/\s-\s/);
    const id = line.slice(0, idx);
    const name = line.slice(idx + 3);
    if (id.trim() && name.trim()) return [stripQuotes(id), stripQuotes(name)];
  }

  const whitespaceMatch = line.match(/^(\S+)\s+(.+)$/);
  if (whitespaceMatch) {
    return [stripQuotes(whitespaceMatch[1]), stripQuotes(whitespaceMatch[2])];
  }

  return null;
}

export const parseCSV = (csvText: string): Student[] => {
  const lines = csvText.trim().split('\n');
  const students: Student[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parsed = splitIdAndName(line);
    if (!parsed) continue;

    // A leading "-" on the ID is common when a spreadsheet renders a numeric
    // ID as a negative-looking value; it's not part of the real ID.
    const id = parsed[0].replace(/^-+/, '').trim();
    const name = parsed[1].trim();

    if (id && name) {
      students.push({
        id,
        name,
        marks: {}
      });
    }
  }

  return students;
};

export const generateCSV = (students: Student[], exams: { id: string; name: string }[]): string => {
  // Header row - include raw and weighted columns for each exam
  let csv = 'Student ID,Student Name';
  exams.forEach(exam => {
    csv += `,${exam.name} (Raw),${exam.name} (Weighted)`;
  });
  csv += '\n';

  // Data rows
  students.forEach(student => {
    csv += `${student.id},${student.name}`;
    exams.forEach(exam => {
      const rawMark = student.marks[exam.id];
      const weightedMark = student.weightedMarks?.[exam.id];
      csv += `,${rawMark !== undefined ? rawMark : ''}`;
      csv += `,${weightedMark !== undefined ? weightedMark : ''}`;
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
