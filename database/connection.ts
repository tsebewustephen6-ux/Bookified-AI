import mongoose from "mongoose";
import { required } from "../lib/env";
const globalDb = globalThis as typeof globalThis & {
  bookifiedDb?: Promise<typeof mongoose>;
};
export async function connect() {
  if (!globalDb.bookifiedDb)
    globalDb.bookifiedDb = mongoose
      .connect(required("MONGODB_URI"), {
        serverSelectionTimeoutMS: 10000,
        autoIndex: false,
      })
      .catch((error) => {
        globalDb.bookifiedDb = undefined;
        throw error;
      });
  return globalDb.bookifiedDb;
}
