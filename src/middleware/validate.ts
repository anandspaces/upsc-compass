import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { Errors } from "../utils/errors";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        if (!fields[key]) fields[key] = issue.message;
      }
      return next(Errors.validation(fields));
    }
    (req as Request & { validated?: T }).validated = result.data;
    next();
  };
}

export function getValidated<T>(req: Request): T {
  return (req as Request & { validated: T }).validated;
}
