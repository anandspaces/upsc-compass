import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    phone: varchar("phone", { length: 10 }).notNull(),
    city: text("city").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUniq: uniqueIndex("users_email_uniq").on(t.email),
  }),
);

export const otps = pgTable(
  "otps",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifyAttempts: integer("verify_attempts").notNull().default(0),
    consumed: boolean("consumed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("otps_email_idx").on(t.email),
    createdAtIdx: index("otps_created_at_idx").on(t.createdAt),
  }),
);

export const revokedTokens = pgTable(
  "revoked_tokens",
  {
    jti: varchar("jti", { length: 64 }).primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiresIdx: index("revoked_tokens_expires_idx").on(t.expiresAt),
  }),
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 8 }).notNull(),
    questionBankVersion: integer("question_bank_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    scores: jsonb("scores").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("assessments_user_idx").on(t.userId),
    userStageStartedUniq: uniqueIndex("assessments_user_stage_started_uniq").on(
      t.userId,
      t.stage,
      t.startedAt,
    ),
  }),
);

export const assessmentAnswers = pgTable(
  "assessment_answers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    questionId: text("question_id").notNull(),
    section: text("section").notNull(),
    sectionTitle: text("section_title").notNull(),
    type: text("type").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").notNull().$type<string[]>(),
    submittedValue: jsonb("submitted_value"),
    submittedLabel: text("submitted_label").notNull(),
  },
  (t) => ({
    assessmentIdx: index("assessment_answers_assessment_idx").on(t.assessmentId),
  }),
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    studentLabel: text("student_label").notNull(),
    sections: jsonb("sections").notNull().$type<unknown[]>(),
    pdfFilename: text("pdf_filename").notNull(),
    pdfSizeBytes: integer("pdf_size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assessmentUniq: uniqueIndex("reports_assessment_uniq").on(t.assessmentId),
    userIdx: index("reports_user_idx").on(t.userId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Otp = typeof otps.$inferSelect;
export type NewOtp = typeof otps.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type AssessmentAnswer = typeof assessmentAnswers.$inferSelect;
export type NewAssessmentAnswer = typeof assessmentAnswers.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
