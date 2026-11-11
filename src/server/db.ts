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
    // Timestamps are stored as UTC without a time zone (Prisma's convention). Pin every session to UTC so
    // database-side now()/CURRENT_TIMESTAMP agree with that, whatever the server's local time zone is.
    globalForDb.__db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }) });
  }
  return globalForDb.__db;
}

export function setDb(client: PrismaClient) {
  globalForDb.__db = client;
}
