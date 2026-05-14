import type { Response } from "express";
import type { AppError, ErrorCode } from "./errors";

export type ApiStatus = 1 | 0 | 2 | -1;

export interface ApiResponse<T extends object = Record<string, never>> {
  status: ApiStatus;
  message: string;
  data: T;
}

export function success<T extends object>(
  res: Response,
  message: string,
  data: T = {} as T,
  httpStatus = 200,
) {
  const body: ApiResponse<T> = { status: 1, message, data };
  return res.status(httpStatus).json(body);
}

export function statusForHttp(http: number): 0 | 2 | -1 {
  if (http >= 500) return -1;
  if (http === 401 || http === 403) return 2;
  return 0;
}

export type ErrorData = { code: ErrorCode; fields?: Record<string, string> };

export function errorResponse(res: Response, err: AppError) {
  const data: ErrorData = {
    code: err.code,
    ...(err.fields ? { fields: err.fields } : {}),
  };
  const body: ApiResponse<ErrorData> = {
    status: statusForHttp(err.status),
    message: err.message,
    data,
  };
  return res.status(err.status).json(body);
}
