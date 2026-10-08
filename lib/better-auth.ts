import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient, type Db } from "mongodb";

const globalMongo = globalThis as typeof globalThis & {
  _betterAuthMongoClient?: MongoClient;
};

export function getMongoClient(): MongoClient {
  if (!globalMongo._betterAuthMongoClient) {
    const uri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/bookified";
    globalMongo._betterAuthMongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  }
  return globalMongo._betterAuthMongoClient;
}

export function getAuthDb(): Db {
  return getMongoClient().db();
}

const client = getMongoClient();
const db = getAuthDb();

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  secret:
    process.env.BETTER_AUTH_SECRET ||
    randomBytes(32).toString("hex"),
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000",
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
