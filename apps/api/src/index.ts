import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import { DemoPersona, connectDb, disconnectDb } from "@repo/db";
import { createApp } from "./create-app.js";
import { seedDemo } from "./seed.js";

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;
// All demo and test records stay in their own database, away from anything else on the cluster.
const dbName = process.env.MONGODB_DB ?? "beat-register-demo";
const demo = process.env.DEMO_MODE !== "false";

if (!mongoUri) {
  console.error("MONGODB_URI is not set. Add your connection string to apps/api/.env.");
  process.exit(1);
}

try {
  await connectDb(mongoUri, dbName);
} catch (error) {
  console.error("Could not connect to MongoDB:", error);
  process.exit(1);
}

// Several serverless instances can start at once; only the one that claims the lock seeds,
// otherwise each seed wipes the others' records halfway through.
async function claimDemoSeed(): Promise<boolean> {
  try {
    await mongoose.connection.collection<{ _id: string }>("locks").insertOne({ _id: "demo-seed" });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

if (demo && (await DemoPersona.countDocuments()) === 0 && (await claimDemoSeed())) {
  console.log("Loading demo data...");
  await seedDemo();
}

const app = express();
app.use(createApp({ demo }));
const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    void disconnectDb().finally(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
