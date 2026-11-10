import { DemoPersona, Photo, Settings, Trade, isDbConnected } from "@repo/db";
import { ROLE_HOME, type Role } from "@repo/shared";
import express, { type Express, Router } from "express";
import { z } from "zod";
import { errorHandler, identify, notFound, param, parse, rejected, zGps } from "./http.js";
import { delivery } from "./routes/delivery.js";
import { field } from "./routes/field.js";
import { godown, owner } from "./routes/godown-owner.js";
import { office } from "./routes/office.js";
import { seedDemo } from "./seed.js";

const MAX_PHOTO_BYTES = 400 * 1024;

export function createApp(options: { demo: boolean }): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    const db = isDbConnected();
    res.status(db ? 200 : 503).json({ status: db ? "ok" : "degraded", db });
  });

  app.get("/trades", async (_req, res) => {
    const trades = await Trade.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(trades);
  });

  const demo = Router();
  demo.use((_req, _res, next) => {
    if (!options.demo) throw notFound("Demo");
    next();
  });
  demo.get("/personas", async (_req, res) => {
    const personas = await DemoPersona.find().sort({ order: 1 }).populate("staffId", "name phone").lean();
    res.json({
      seeded: personas.length > 0,
      personas: personas.map((p) => ({ ...p, home: ROLE_HOME[p.role as Role] })),
    });
  });
  demo.post("/reset", async (_req, res) => {
    await seedDemo();
    res.json({ ok: true });
  });
  app.use("/demo", demo);

  app.get("/photos/:id", async (req, res) => {
    const photo = await Photo.findById(param(req, "id"));
    if (!photo) throw notFound("Photo");
    res.type(photo.mime).set("Cache-Control", "private, max-age=86400").send(photo.data);
  });

  app.use(identify);

  app.get("/me", async (req, res) => {
    const settings = await Settings.findOne().lean();
    res.json({
      staff: req.staff.toObject(),
      demo: options.demo,
      firm: { name: settings?.firmName ?? "", upiId: settings?.firmUpiId ?? "" },
    });
  });

  app.post("/photos", async (req, res) => {
    const body = parse(
      z.object({ kind: z.string().min(2), dataUrl: z.string().startsWith("data:image/"), gps: zGps.optional() }),
      req.body,
    );
    const match = /^data:(image\/(?:jpeg|png|svg\+xml));base64,(.+)$/.exec(body.dataUrl);
    if (!match) throw rejected("Unsupported photo format.");
    const data = Buffer.from(match[2]!, "base64");
    if (data.length > MAX_PHOTO_BYTES) throw rejected("Photo is too large.");
    const photo = await Photo.create({ kind: body.kind, mime: match[1]!, data, takenBy: req.staff._id, gps: body.gps ?? null });
    res.json({ photoId: photo._id });
  });

  app.use("/field", field);
  app.use("/delivery", delivery);
  app.use("/godown", godown);
  app.use("/office", office);
  app.use("/owner", owner);

  app.use(errorHandler);
  return app;
}
