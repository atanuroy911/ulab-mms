'use client';

import { useEffect, useState } from 'react';

export interface StudentMe {
  studentId: string;
  name: string;
  /** An admin viewing the portal as this student - read only. */
  viewAs: boolean;
  viewedBy: string | null;
}

// Fetched once per page load and shared by every portal component.
let cached: Promise<StudentMe | null> | null = null;

/** Who the portal is showing: the signed-in student, or the one an admin is viewing as. */
export function useStudentMe(): StudentMe | null {
  const [me, setMe] = useState<StudentMe | null>(null);
  useEffect(() => {
    cached ??= fetch('/api/student/me')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    let alive = true;
    cached.then((v) => alive && setMe(v));
    return () => {
      alive = false;
    };
  }, []);
  return me;
}
