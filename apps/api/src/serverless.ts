import type { IncomingMessage, ServerResponse } from "node:http";
import { DemoPersona, connectDb } from "@repo/db";
import type { Express } from "express";
import { createApp } from "./app.js";
import { seedDemo } from "./seed.js";

const demo = process.env.DEMO_MODE !== "false";

async function start(): Promise<Express> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set.");
  await connectDb(mongoUri, process.env.MONGODB_DB ?? "beat-register-demo");
  if (demo && (await DemoPersona.countDocuments()) === 0) await seedDemo();
  return createApp({ demo });
}

// A warm function reuses one connection. A failed start is dropped so the next request can retry.
let ready: Promise<Express> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    ready ??= start().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    const app = await ready;
    app(req, res);
  } catch (error) {
    console.error("API could not start:", error);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "The server could not reach the database." }));
  }
}
