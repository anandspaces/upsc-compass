import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { Errors } from "../utils/errors";

function issuesToFields(issues: { path: (string | number)[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(Errors.validation(issuesToFields(result.error.issues)));
    }
    (req as Request & { validated?: T }).validated = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(Errors.validation(issuesToFields(result.error.issues)));
    }
    (req as Request & { validatedQuery?: T }).validatedQuery = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(Errors.validation(issuesToFields(result.error.issues)));
    }
    (req as Request & { validatedParams?: T }).validatedParams = result.data;
    next();
  };
}

export function getValidated<T>(req: Request): T {
  return (req as Request & { validated: T }).validated;
}

export function getValidatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}

export function getValidatedParams<T>(req: Request): T {
  return (req as Request & { validatedParams: T }).validatedParams;
}
