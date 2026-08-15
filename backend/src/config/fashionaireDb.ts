import { MongoClient, type Db } from "mongodb";
import { env } from "./env.js";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Read-only access to the `Fashionere` MongoDB database populated by the
 * Python Trend Analysis Engine / Deconstruction Engine. Separate from the
 * Mongoose connection in db.ts, which owns backend-native collections
 * (users, projects) in a different database.
 */
export async function getFashionaireDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.FASHIONAIRRE_MONGO_URI);
  await client.connect();
  // "Fashionere" (sic) matches the DB name hardcoded by the Python engines.
  db = client.db("Fashionere");
  return db;
}
