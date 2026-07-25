import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role?: string;
      googleLinked?: boolean;
      hasPassword?: boolean;
      checkinOnly?: boolean;
      marksOnly?: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: string;
    googleLinked?: boolean;
    hasPassword?: boolean;
    checkinOnly?: boolean;
  }
}
