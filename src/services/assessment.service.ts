import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { env } from "../config/env";
import { type DB, getDb } from "../db";
import {
  type Assessment,
  type AssessmentAnswer,
  type Report,
  assessmentAnswers,
  assessments,
  reports,
} from "../db/schema";
import { Errors } from "../utils/errors";
import type { ParsedFile } from "../utils/multipart";
import type {
  AnswerInput,
  ReportPayload,
  SubmitAssessmentBody,
} from "../validators/assessment.validator";

const STAGE_TITLES: Record<string, string> = {
  S1: "Stage 1 — Foundations",
  S2: "Stage 2 — Aptitude & Aspiration",
  S3: "Stage 3 — Effort & Strategy",
  S4: "Stage 4 — Resilience & Resources",
};

function stageTitle(stage: string): string {
  return STAGE_TITLES[stage] ?? stage;
}

function pdfPublicUrl(filename: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/v1/files/reports/${filename}`;
}

function answerRowToJson(a: AssessmentAnswer) {
  return {
    questionId: a.questionId,
    section: a.section,
    sectionTitle: a.sectionTitle,
    type: a.type,
    prompt: a.prompt,
    options: a.options,
    submittedValue: a.submittedValue,
    submittedLabel: a.submittedLabel,
  };
}

function assessmentSummary(a: Assessment, report: Report | null) {
  const scores = a.scores as Record<string, unknown>;
  return {
    assessmentId: a.id,
    reportId: report?.id ?? null,
    stage: a.stage,
    stageTitle: stageTitle(a.stage),
    completedAt: a.completedAt.toISOString(),
    uri: scores.uri ?? null,
    gsPct: scores.gsPct ?? null,
    isAiGenerated: report?.isAiGenerated ?? null,
    pdfUrl: report ? pdfPublicUrl(report.pdfFilename) : null,
  };
}

export async function submitAssessment(
  userId: string,
  body: SubmitAssessmentBody,
  db: DB = getDb(),
): Promise<{ assessmentId: string }> {
  const startedAt = new Date(body.startedAt);
  const completedAt = new Date(body.completedAt);

  // Idempotency: same user/stage/startedAt = same session.
  const [existing] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(
        eq(assessments.userId, userId),
        eq(assessments.stage, body.stage),
        eq(assessments.startedAt, startedAt),
      ),
    );
  if (existing) throw Errors.assessmentAlreadySubmitted();

  const assessmentId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(assessments).values({
      id: assessmentId,
      userId,
      stage: body.stage,
      questionBankVersion: body.questionBankVersion,
      startedAt,
      completedAt,
      scores: body.scores as Record<string, unknown>,
    });

    if (body.answers.length > 0) {
      await tx.insert(assessmentAnswers).values(
        body.answers.map((a: AnswerInput, idx: number) => ({
          assessmentId,
          ordinal: idx,
          questionId: a.questionId,
          section: a.section,
          sectionTitle: a.sectionTitle,
          type: a.type,
          prompt: a.prompt,
          options: a.options,
          submittedValue: a.submittedValue ?? null,
          submittedLabel: a.submittedLabel,
        })),
      );
    }
  });

  return { assessmentId };
}

async function ensureUploadDir(): Promise<string> {
  const baseDir = path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.resolve(process.cwd(), env.UPLOAD_DIR);
  const reportsDir = path.join(baseDir, "reports");
  await mkdir(reportsDir, { recursive: true });
  return reportsDir;
}

export async function uploadAssessmentReport(
  userId: string,
  assessmentId: string,
  input: {
    isAiGenerated: boolean;
    generatedAt: string;
    reportPayload: ReportPayload;
    pdfFile: ParsedFile;
  },
  db: DB = getDb(),
): Promise<{ reportId: string; pdfUrl: string }> {
  const [assessment] = await db
    .select({ id: assessments.id, userId: assessments.userId })
    .from(assessments)
    .where(eq(assessments.id, assessmentId));
  if (!assessment) throw Errors.assessmentNotFound();
  if (assessment.userId !== userId) throw Errors.forbidden();

  if (input.pdfFile.contentType !== "application/pdf") {
    throw Errors.invalidUpload("pdfFile must be a PDF (application/pdf).", {
      pdfFile: "Must be application/pdf",
    });
  }

  const reportsDir = await ensureUploadDir();
  const reportId = randomUUID();
  const pdfFilename = `${reportId}.pdf`;
  const pdfPath = path.join(reportsDir, pdfFilename);

  await writeFile(pdfPath, input.pdfFile.data);

  try {
    // Replace any prior report for this assessment (one-to-one).
    await db.transaction(async (tx) => {
      const [prior] = await tx
        .select({ id: reports.id, pdfFilename: reports.pdfFilename })
        .from(reports)
        .where(eq(reports.assessmentId, assessmentId));
      if (prior) {
        await tx.delete(reports).where(eq(reports.id, prior.id));
        const priorPath = path.join(reportsDir, prior.pdfFilename);
        try {
          await unlink(priorPath);
        } catch {
          // best-effort; ignore if file is already gone
        }
      }
      await tx.insert(reports).values({
        id: reportId,
        assessmentId,
        userId,
        isAiGenerated: input.isAiGenerated,
        generatedAt: new Date(input.generatedAt),
        studentLabel: input.reportPayload.studentLabel,
        sections: input.reportPayload.sections,
        pdfFilename,
        pdfSizeBytes: input.pdfFile.data.length,
      });
    });
  } catch (err) {
    // Roll back file write on DB failure.
    try {
      await unlink(pdfPath);
    } catch {
      // ignore
    }
    throw err;
  }

  return { reportId, pdfUrl: pdfPublicUrl(pdfFilename) };
}

export async function listAssessmentsForUser(
  userId: string,
  options: { page: number; limit: number },
  db: DB = getDb(),
): Promise<{
  total: number;
  page: number;
  limit: number;
  reports: ReturnType<typeof assessmentSummary>[];
}> {
  const offset = (options.page - 1) * options.limit;
  const rows = await db
    .select({ a: assessments, r: reports })
    .from(assessments)
    .leftJoin(reports, eq(reports.assessmentId, assessments.id))
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.completedAt))
    .limit(options.limit)
    .offset(offset);

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assessments)
    .where(eq(assessments.userId, userId))) as [{ count: number }];

  return {
    total: count,
    page: options.page,
    limit: options.limit,
    reports: rows.map((row) => assessmentSummary(row.a, row.r)),
  };
}

export async function getAssessmentDetail(userId: string, assessmentId: string, db: DB = getDb()) {
  const [row] = await db
    .select({ a: assessments, r: reports })
    .from(assessments)
    .leftJoin(reports, eq(reports.assessmentId, assessments.id))
    .where(eq(assessments.id, assessmentId));
  if (!row) throw Errors.assessmentNotFound();
  if (row.a.userId !== userId) throw Errors.forbidden();

  const answers = await db
    .select()
    .from(assessmentAnswers)
    .where(eq(assessmentAnswers.assessmentId, assessmentId))
    .orderBy(assessmentAnswers.ordinal);

  return {
    assessmentId: row.a.id,
    stage: row.a.stage,
    stageTitle: stageTitle(row.a.stage),
    completedAt: row.a.completedAt.toISOString(),
    startedAt: row.a.startedAt.toISOString(),
    questionBankVersion: row.a.questionBankVersion,
    scores: row.a.scores,
    answers: answers.map(answerRowToJson),
    report: row.r
      ? {
          reportId: row.r.id,
          isAiGenerated: row.r.isAiGenerated,
          generatedAt: row.r.generatedAt.toISOString(),
          pdfUrl: pdfPublicUrl(row.r.pdfFilename),
          studentLabel: row.r.studentLabel,
          sections: row.r.sections,
        }
      : null,
  };
}
