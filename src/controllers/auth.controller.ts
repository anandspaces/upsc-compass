import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getValidated } from "../middleware/validate";
import * as authService from "../services/auth.service";
import { success } from "../utils/response";
import type {
  LoginBody,
  RegisterBody,
  ResendOtpBody,
  VerifyOtpBody,
} from "../validators/auth.validator";

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = getValidated<RegisterBody>(req);
    await authService.register(body);
    return success(res, { message: "OTP sent to email" }, 201);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = getValidated<VerifyOtpBody>(req);
    const { token, user } = await authService.verifyOtpAndIssueToken(body.email, body.otp);
    return success(res, { token, user });
  } catch (err) {
    next(err);
  }
}

export async function resendOtpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = getValidated<ResendOtpBody>(req);
    await authService.resendOtp(body.email);
    return success(res, { message: "OTP resent" });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = getValidated<LoginBody>(req);
    const { token, user } = await authService.login(body.email, body.password);
    return success(res, { token, user });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { auth } = req as AuthenticatedRequest;
    await authService.revokeToken(auth.jti, new Date(auth.exp * 1000));
    return success(res, {});
  } catch (err) {
    next(err);
  }
}
