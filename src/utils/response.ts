import type { Response } from "express";
import type { AppError, ErrorCode } from "./errors";

export interface ApiSuccess {
  status: 1;
}

export interface ApiError {
  status: 0;
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}

export function success<T extends object>(res: Response, body: T, statusCode = 200) {
  return res.status(statusCode).json({ status: 1, ...body });
}

export function errorResponse(res: Response, err: AppError) {
  const payload: ApiError = {
    status: 0,
    error: {
      code: err.code,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    },
  };
  return res.status(err.status).json(payload);
}
