// Utility functions for grading scale management

export interface GradeThreshold {
  threshold: number; // Percentage threshold (0-100)
  letter: string; // Letter grade (A, B, C, D, F)
  modifier: string; // Modifier: '0'=Plain, '1'=Minus, '2'=Plus, '0' for Fail
}

// Default grading scale based on the provided image
export const DEFAULT_GRADING_SCALE: GradeThreshold[] = [
  { threshold: 0, letter: 'F', modifier: '0' },    // Fail
  { threshold: 50, letter: 'D', modifier: '0' },   // D
  { threshold: 60, letter: 'C', modifier: '0' },   // C
  { threshold: 65, letter: 'C', modifier: '2' },   // C+
  { threshold: 70, letter: 'B', modifier: '1' },   // B-
  { threshold: 75, letter: 'B', modifier: '0' },   // B
  { threshold: 80, letter: 'B', modifier: '2' },   // B+
  { threshold: 85, letter: 'A', modifier: '1' },   // A-
  { threshold: 90, letter: 'A', modifier: '0' },   // A
  { threshold: 95, letter: 'A', modifier: '2' },   // A+
];

/**
 * Encode grading scale array to compact string format
 * Format: "threshold:letter:modifier|threshold:letter:modifier|..."
 * Example: "0:F:0|50:D:0|55:C:1|60:C:2|..."
 */
export function encodeGradingScale(grades: GradeThreshold[]): string {
  return grades
    .sort((a, b) => a.threshold - b.threshold)
    .map(g => `${g.threshold}:${g.letter}:${g.modifier}`)
    .join('|');
}

/**
 * Decode grading scale string to array
 * Handles malformed strings gracefully and returns default scale if invalid
 */
export function decodeGradingScale(encoded: string | any[] | undefined | null): GradeThreshold[] {
  if (!encoded) return DEFAULT_GRADING_SCALE;
  
  if (Array.isArray(encoded)) {
    return encoded.sort((a, b) => a.threshold - b.threshold);
  }
  
  if (typeof encoded !== 'string') {
    return DEFAULT_GRADING_SCALE;
  }
  
  try {
    // Check if it's a JSON string first
    if (encoded.trim().startsWith('[')) {
      const parsed = JSON.parse(encoded);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => a.threshold - b.threshold);
      }
    }
    
    // Otherwise fallback to pipe-separated format
    const parts = encoded.split('|');
    const grades: GradeThreshold[] = [];
    
    for (const part of parts) {
      const [threshold, letter, modifier] = part.split(':');
      if (!threshold || !letter || !modifier) continue;
      
      grades.push({
        threshold: parseFloat(threshold),
        letter,
        modifier,
      });
    }
    
    if (grades.length === 0) return DEFAULT_GRADING_SCALE;
    
    return grades.sort((a, b) => a.threshold - b.threshold);
  } catch (error) {
    console.error('Error decoding grading scale:', error);
    return DEFAULT_GRADING_SCALE;
  }
}

/**
 * Get modifier display name
 */
export function getModifierName(modifier: string): string {
  switch (modifier) {
    case '0': return 'Plain';
    case '1': return 'Minus';
    case '2': return 'Plus';
    default: return 'Plain';
  }
}

/**
 * Get full grade display (e.g., "A+ (Plus)", "B- (Minus)", "F (Fail)")
 */
export function getGradeDisplay(letter: string, modifier?: string): string {
  if (letter === 'F') return 'F (Fail)';
  
  const modifierSymbol = modifier === '1' ? '-' : modifier === '2' ? '+' : '';
  const modifierName = modifier ? getModifierName(modifier) : '';
  
  return modifier ? `${letter}${modifierSymbol} (${modifierName})` : letter;
}

/**
 * Calculate letter grade based on percentage and grading scale
 */
export function calculateLetterGrade(percentage: number, gradingScale: string | undefined | null): {
  letter: string;
  modifier: string;
  display: string;
} {
  const grades = decodeGradingScale(gradingScale);
  
  // Find the appropriate grade threshold
  let selectedGrade = grades[0]; // Default to lowest grade
  
  for (let i = grades.length - 1; i >= 0; i--) {
    if (percentage >= grades[i].threshold) {
      selectedGrade = grades[i];
      break;
    }
  }
  
  return {
    letter: selectedGrade.letter,
    modifier: selectedGrade.modifier,
    display: getGradeDisplay(selectedGrade.letter, selectedGrade.modifier),
  };
}

/**
 * Validate grading scale for overlaps and gaps
 * Returns error message if invalid, null if valid
 */
export function validateGradingScale(grades: GradeThreshold[]): string | null {
  if (grades.length === 0) {
    return 'Grading scale cannot be empty';
  }
  
  // Sort by threshold
  const sorted = [...grades].sort((a, b) => a.threshold - b.threshold);
  
  // Check if first threshold is 0
  if (sorted[0].threshold !== 0) {
    return 'First threshold must start at 0%';
  }
  
  // Check for duplicates
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].threshold === sorted[i - 1].threshold) {
      return `Duplicate threshold at ${sorted[i].threshold}%`;
    }
  }
  
  // Check if thresholds are within valid range
  for (const grade of sorted) {
    if (grade.threshold < 0 || grade.threshold > 100) {
      return 'All thresholds must be between 0 and 100';
    }
  }
  
  return null; // Valid
}

/**
 * Get grade color for styling
 */
export function getGradeColor(letter: string): string {
  switch (letter) {
    case 'A': return 'text-green-600 dark:text-green-400';
    case 'B': return 'text-blue-600 dark:text-blue-400';
    case 'C': return 'text-yellow-600 dark:text-yellow-400';
    case 'D': return 'text-orange-600 dark:text-orange-400';
    case 'F': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
  }
}

/**
 * Get grade background color for styling. Returns a theme-aware pair
 * (light/dark variants baked in), so callers no longer need to track theme.
 */
export function getGradeBgColor(letter: string): string {
  switch (letter) {
    case 'A': return 'bg-green-100 dark:bg-green-900/30';
    case 'B': return 'bg-blue-100 dark:bg-blue-900/30';
    case 'C': return 'bg-yellow-100 dark:bg-yellow-900/30';
    case 'D': return 'bg-orange-100 dark:bg-orange-900/30';
    case 'F': return 'bg-red-100 dark:bg-red-900/30';
    default: return 'bg-muted';
  }
}
