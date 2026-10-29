import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient, type Db } from "mongodb";

const globalMongo = globalThis as typeof globalThis & {
  _betterAuthMongoClient?: MongoClient;
};

function isClientClosed(client?: MongoClient): boolean {
  if (!client) return true;
  const topology = (client as unknown as { topology?: { s?: { state?: string } } }).topology;
  if (!topology) return false;
  const state = topology.s?.state;
  return !topology.s || state === "closed" || state === "closing";
}

export function getMongoClient(): MongoClient {
  const existing = globalMongo._betterAuthMongoClient;
  if (!existing || isClientClosed(existing)) {
    if (existing) {
      try {
        void existing.close().catch(() => {});
      } catch {
        // ignore close error
      }
    }
    const uri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/bookified";
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      maxIdleTimeMS: 60000,
    });
    globalMongo._betterAuthMongoClient = client;
    return client;
  }
  return existing;
}

export function getAuthDb(): Db {
  return getMongoClient().db();
}

const dbProxy = new Proxy({} as Db, {
  get(_target, prop) {
    const activeDb = getMongoClient().db();
    const value = (activeDb as any)[prop];
    if (typeof value === "function") {
      return value.bind(activeDb);
    }
    return value;
  },
});

const clientProxy = new Proxy({} as MongoClient, {
  get(_target, prop) {
    const activeClient = getMongoClient();
    const value = (activeClient as any)[prop];
    if (typeof value === "function") {
      return value.bind(activeClient);
    }
    return value;
  },
});

export const auth = betterAuth({
  database: mongodbAdapter(dbProxy, { client: clientProxy }),
  secret:
    process.env.BETTER_AUTH_SECRET ||
    randomBytes(32).toString("hex"),
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.APP_BASE_URL ||
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"),
  rateLimit: { enabled: true, storage: "database" },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  user: {
    additionalFields: {
      plan: {
        type: "string",
        required: false,
        defaultValue: "free",
        input: false,
      },
    },
  },
});
