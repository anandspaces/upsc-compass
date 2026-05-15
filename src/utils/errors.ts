export type ErrorCode =
  | "VALIDATION_FAILED"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "EMAIL_NOT_REGISTERED"
  | "INVALID_OTP"
  | "OTP_EXPIRED"
  | "OTP_ATTEMPTS_EXCEEDED"
  | "OTP_RATE_LIMITED"
  | "UNAUTHORIZED"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "FORBIDDEN"
  | "ASSESSMENT_NOT_FOUND"
  | "ASSESSMENT_ALREADY_SUBMITTED"
  | "FILE_TOO_LARGE"
  | "INVALID_UPLOAD"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const Errors = {
  emailAlreadyExists: () =>
    new AppError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists.", {
      email: "Already registered",
    }),
  emailNotRegistered: () =>
    new AppError(404, "EMAIL_NOT_REGISTERED", "No account found for this email."),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password."),
  emailNotVerified: () =>
    new AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email before logging in."),
  invalidOtp: () => new AppError(400, "INVALID_OTP", "The OTP you entered is incorrect."),
  otpExpired: () =>
    new AppError(400, "OTP_EXPIRED", "This OTP has expired. Please request a new one."),
  otpAttemptsExceeded: () =>
    new AppError(
      400,
      "OTP_ATTEMPTS_EXCEEDED",
      "Too many incorrect attempts. Please request a new OTP.",
    ),
  otpRateLimited: (retryAfterSeconds: number) =>
    new AppError(
      429,
      "OTP_RATE_LIMITED",
      `Too many OTP requests. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
    ),
  unauthorized: () => new AppError(401, "UNAUTHORIZED", "Missing or invalid Authorization header."),
  tokenExpired: () => new AppError(401, "TOKEN_EXPIRED", "Your session has expired."),
  tokenRevoked: () => new AppError(401, "TOKEN_REVOKED", "This token has been revoked."),
  validation: (fields: Record<string, string>) =>
    new AppError(422, "VALIDATION_FAILED", "One or more fields are invalid.", fields),
  forbidden: () => new AppError(403, "FORBIDDEN", "You do not have access to this resource."),
  assessmentNotFound: () => new AppError(404, "ASSESSMENT_NOT_FOUND", "Assessment not found."),
  assessmentAlreadySubmitted: () =>
    new AppError(
      409,
      "ASSESSMENT_ALREADY_SUBMITTED",
      "This assessment session has already been submitted.",
    ),
  fileTooLarge: (maxBytes: number) =>
    new AppError(
      413,
      "FILE_TOO_LARGE",
      `Uploaded file exceeds the maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    ),
  invalidUpload: (message: string, fields?: Record<string, string>) =>
    new AppError(400, "INVALID_UPLOAD", message, fields),
};
