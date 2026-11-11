import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export { Prisma };

const globalForDb = globalThis as unknown as { __db?: PrismaClient };

/** Returns the shared Prisma client. Tests replace it with an in-process PGlite client via setDb(). */
export function db(): PrismaClient {
  if (!globalForDb.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  return globalForDb.__db;
}

export function setDb(client: PrismaClient) {
  globalForDb.__db = client;
}
