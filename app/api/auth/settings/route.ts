import { NextResponse } from 'next/server';
import {
  isCredentialsLoginEnabled,
  isCourseCodeEditableByTeacher,
  isDevAnyEmailDomainAllowed,
  isDevStudentTestSignInEnabled,
} from '@/lib/authSettings';

// Public: the sign-in/sign-up pages need to know this before a user is authenticated,
// and the teacher course panel needs courseCodeEditableByTeacher without an admin token.
export async function GET() {
  try {
    const [credentialsLoginEnabled, courseCodeEditableByTeacher, devAllowAnyEmailDomain, devStudentTestSignIn] =
      await Promise.all([
        isCredentialsLoginEnabled(),
        isCourseCodeEditableByTeacher(),
        isDevAnyEmailDomainAllowed(),
        isDevStudentTestSignInEnabled(),
      ]);
    // devStudentTestSignIn is only a yes/no - the test addresses themselves stay private.
    return NextResponse.json({ credentialsLoginEnabled, courseCodeEditableByTeacher, devAllowAnyEmailDomain, devStudentTestSignIn });
  } catch (error) {
    console.error('Error loading auth settings:', error);
    // Fail open on both -- a transient DB error shouldn't lock teachers out of existing behavior.
    return NextResponse.json({ credentialsLoginEnabled: true, courseCodeEditableByTeacher: true, devAllowAnyEmailDomain: false, devStudentTestSignIn: false });
  }
}
