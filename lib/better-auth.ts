import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { bearer, oneTimeToken } from "better-auth/plugins";
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
  plugins: [
    bearer({ requireSignature: true }), 
    oneTimeToken({ disableClientRequest: true, storeToken: "hashed", expiresIn: 2 })
  ],
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
  trustedOrigins: ["bookified://", "http://10.70.22.83:3000", "exp://10.70.22.83:8081", "exp://10.70.22.83:8081/--/", "http://10.70.22.83:8081"],
});
