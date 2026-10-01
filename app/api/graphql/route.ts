import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server';
import { typeDefs } from '@/lib/graphql/schema';
import { resolvers } from '@/lib/graphql/resolvers';
import { createContext } from '@/lib/graphql/auth';
import { createLoaders } from '@/lib/graphql/dataloaders';
import { getRequestIp } from '@/lib/rateLimit';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  // The schema is browsable in development only.
  introspection: process.env.NODE_ENV !== 'production',
});

const handler = startServerAndCreateNextHandler(server, {
  context: async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization') || undefined;
    const context = createContext(authHeader, getRequestIp(req));
    const loaders = createLoaders();

    return {
      ...context,
      loaders,
    };
  },
});

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}
