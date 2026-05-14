import { z } from "zod";

const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[\w.\-]+@[\w\-]+\.\w{2,}$/;
const OTP_RE = /^\d{6}$/;

const nameSchema = z.string({ required_error: "Required" }).trim().min(1, "Required");
const phoneSchema = z
  .string({ required_error: "Required" })
  .trim()
  .regex(PHONE_RE, "Must be exactly 10 digits");
const citySchema = z.string({ required_error: "Required" }).trim().min(1, "Required");
const emailSchema = z
  .string({ required_error: "Required" })
  .trim()
  .toLowerCase()
  .regex(EMAIL_RE, "Invalid email");
const passwordSchema = z
  .string({ required_error: "Required" })
  .min(6, "Must be at least 6 characters");
const otpSchema = z.string({ required_error: "Required" }).regex(OTP_RE, "Must be 6 digits");

export const registerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  city: citySchema,
  email: emailSchema,
  password: passwordSchema,
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

export const resendOtpSchema = z.object({
  email: emailSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type ResendOtpBody = z.infer<typeof resendOtpSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
