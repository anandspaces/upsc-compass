import { z } from "zod";

const isoDate = z
  .string({ required_error: "Required" })
  .datetime({ offset: true, local: true, message: "Must be an ISO 8601 timestamp" });

const stageSchema = z
  .string({ required_error: "Required" })
  .trim()
  .regex(/^S[1-4]$/, "Must be one of S1, S2, S3, S4");

const questionTypeSchema = z.enum(["single", "multi", "slider", "text", "dropdown"], {
  errorMap: () => ({ message: "Must be one of single, multi, slider, text, dropdown" }),
});

const answerSchema = z.object({
  questionId: z.string({ required_error: "Required" }).trim().min(1, "Required"),
  section: z.string({ required_error: "Required" }).trim().min(1, "Required"),
  sectionTitle: z.string({ required_error: "Required" }).trim().min(1, "Required"),
  type: questionTypeSchema,
  prompt: z.string({ required_error: "Required" }).trim().min(1, "Required"),
  options: z.array(z.string()).default([]),
  submittedValue: z.unknown().nullable(),
  submittedLabel: z.string().default(""),
});

// Scores fields are heterogeneous (numbers + enum-like strings). Keep the
// schema permissive (passthrough) so the backend can persist whatever the
// app computes, while still requiring an object.
const scoresSchema = z.object({}).passthrough();

export const submitAssessmentSchema = z
  .object({
    stage: stageSchema,
    questionBankVersion: z
      .number({ required_error: "Required" })
      .int("Must be an integer")
      .nonnegative("Must be >= 0"),
    startedAt: isoDate,
    completedAt: isoDate,
    scores: scoresSchema,
    answers: z.array(answerSchema).min(1, "At least one answer is required"),
  })
  .refine((v) => new Date(v.completedAt).getTime() >= new Date(v.startedAt).getTime(), {
    message: "completedAt must be >= startedAt",
    path: ["completedAt"],
  });

export type SubmitAssessmentBody = z.infer<typeof submitAssessmentSchema>;
export type AnswerInput = z.infer<typeof answerSchema>;

// Pagination for GET /assessments
export const listAssessmentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;

// Validates a UUID route param.
export const assessmentIdParamSchema = z.object({
  assessmentId: z.string({ required_error: "Required" }).uuid({ message: "Must be a valid UUID" }),
});

export type AssessmentIdParam = z.infer<typeof assessmentIdParamSchema>;

// Multipart form fields for POST /assessments/:id/report.
// `reportJson` is the string body of `{ studentLabel, sections[] }`.
export const reportFormSchema = z.object({
  isAiGenerated: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional()
    .default(false),
  generatedAt: isoDate,
  reportJson: z.string({ required_error: "Required" }).min(2, "Required"),
});

export type ReportFormFields = z.infer<typeof reportFormSchema>;

const reportSectionSchema = z.object({
  heading: z.string().default(""),
  subheading: z.string().optional().nullable(),
  visual: z.unknown().optional().nullable(),
  paragraphs: z.array(z.string()).optional().default([]),
  bullets: z.array(z.string()).optional().default([]),
});

export const reportPayloadSchema = z.object({
  studentLabel: z.string({ required_error: "Required" }).trim().min(1, "Required"),
  sections: z.array(reportSectionSchema).default([]),
});

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
