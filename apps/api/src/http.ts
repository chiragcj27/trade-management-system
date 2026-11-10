import { Staff, type StaffAttrs } from "@repo/db";
import type { Role } from "@repo/shared";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff: HydratedDocument<StaffAttrs>;
    }
  }
}

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} was not found.`);
export const rejected = (message: string, code?: string) => new AppError(422, message, code);

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") throw new AppError(400, `Missing ${name}.`);
  return value;
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(400, issue ? `${issue.path.join(".") || "Request"}: ${issue.message}` : "Invalid request.");
  }
  return result.data;
}

/**
 * Temporary identity: the role picker sends the chosen staff id. Login replaces
 * this one function later, so nothing here is safe to expose on the internet yet.
 */
export const identify: RequestHandler = async (req, _res, next) => {
  const id = req.header("x-staff-id");
  if (!id || !/^[a-f0-9]{24}$/.test(id)) throw new AppError(401, "Choose a role first.");
  const staff = await Staff.findById(id);
  if (!staff || !staff.active) throw new AppError(401, "This staff member is not available.");
  req.staff = staff;
  next();
};

export function allow(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(req.staff.role as Role)) {
      throw new AppError(403, "Your role cannot do this.");
    }
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof RangeError) {
    res.status(422).json({ error: error.message });
    return;
  }
  if ((error as { code?: number }).code === 11000) {
    res.status(409).json({ error: duplicateMessage(error as { keyPattern?: Record<string, number> }), code: "duplicate" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server." });
};

function duplicateMessage(error: { keyPattern?: Record<string, number> }): string {
  const key = Object.keys(error.keyPattern ?? {})[0];
  const messages: Record<string, string> = {
    receiptNo: "This receipt number has already been used.",
    upiTransactionRef: "This UPI transaction reference has already been used.",
    duplicateKey: "This fuel bill has already been claimed.",
    billNo: "This bill number already exists.",
    clientRef: "This entry was already saved.",
  };
  return (key && messages[key]) || "This record already exists.";
}

export const zId = z.string().regex(/^[a-f0-9]{24}$/, "must be a valid id");
export const zGps = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
});
export const zPaise = z.number().int().positive();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date");
