import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      /** @deprecated superseded by `roles` */
      role?: string;
      roles?: string[];
      departmentId?: string | null;
      coordinatorDepartments?: string[];
      googleLinked?: boolean;
      hasPassword?: boolean;
      checkinOnly?: boolean;
      marksOnly?: boolean;
      projectOnly?: boolean;
      studentSession?: boolean;
      studentAccountId?: string | null;
      studentIdText?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role?: string;
    roles?: string[];
    departmentId?: string | null;
    coordinatorDepartments?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: string;
    roles?: string[];
    departmentId?: string | null;
    coordinatorDepartments?: string[];
    googleLinked?: boolean;
    hasPassword?: boolean;
    checkinOnly?: boolean;
    marksOnly?: boolean;
    projectOnly?: boolean;
    studentSession?: boolean;
    studentAccountId?: string | null;
    studentIdText?: string | null;
    /** ms timestamp of the last DB-backed role/department refresh; internal throttle only. */
    roleRefreshedAt?: number;
  }
}
