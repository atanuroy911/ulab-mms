import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET && !process.env.NEXTAUTH_SECRET) {
  throw new Error('JWT_SECRET or NEXTAUTH_SECRET must be set - GraphQL auth cannot fall back to a hardcoded secret');
}

const JWT_SECRET = (process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET) as string;
const JWT_EXPIRES_IN = '7d';
// Marks a token as a GraphQL token. The secret can be shared with other tokens (e.g. the
// admin cookie), so without this one kind of token could be replayed as another.
const AUDIENCE = 'mms-graphql';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface GraphQLContext {
  user?: JWTPayload;
  isAuthenticated: boolean;
  /** The caller's IP, for rate limiting the login mutation. */
  ip?: string;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, audience: AUDIENCE, algorithm: 'HS256' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { audience: AUDIENCE, algorithms: ['HS256'] }) as JWTPayload;
    // Every query scopes by userId - a token without one must never get through.
    if (typeof decoded?.userId !== 'string' || !decoded.userId) return null;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function createContext(authHeader?: string, ip?: string): GraphQLContext {
  if (!authHeader) {
    return { isAuthenticated: false, ip };
  }

  const token = authHeader.replace('Bearer ', '');
  const user = verifyToken(token);

  if (!user) {
    return { isAuthenticated: false, ip };
  }

  return {
    user,
    isAuthenticated: true,
    ip,
  };
}

export function requireAuth(context: GraphQLContext): JWTPayload {
  if (!context.isAuthenticated || !context.user) {
    throw new Error('Authentication required');
  }
  return context.user;
}

export function requireRole(context: GraphQLContext, allowedRoles: string[]): JWTPayload {
  const user = requireAuth(context);

  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
  }

  return user;
}
