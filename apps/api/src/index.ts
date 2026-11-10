import "dotenv/config";
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

if (demo && (await DemoPersona.countDocuments()) === 0) {
  console.log("Loading demo data...");
  await seedDemo();
}

const server = createApp({ demo }).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    void disconnectDb().finally(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
