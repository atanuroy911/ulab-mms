import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escapes regex metacharacters so a user-supplied string can be safely interpolated
 * into a `new RegExp(...)` / `$regex` query. Without this, input like ".*" broadens an
 * intended exact match to every record, and a crafted pattern can trigger catastrophic
 * backtracking (ReDoS) inside MongoDB's regex engine.
 * @param value - Raw user input to be used as a literal inside a regex
 * @returns The input with all regex special characters escaped
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates email format according to a comprehensive regex pattern
 * @param email - The email address to validate
 * @returns true if email is valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Email regex pattern - matches most common email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Additional checks
  const trimmedEmail = email.trim();
  const isValidFormat = emailRegex.test(trimmedEmail);
  const hasValidLength = trimmedEmail.length >= 5 && trimmedEmail.length <= 254;
  const hasValidLocalPart = trimmedEmail.split('@')[0].length <= 64;

  return isValidFormat && hasValidLength && hasValidLocalPart;
}
