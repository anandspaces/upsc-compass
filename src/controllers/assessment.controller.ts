import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import type { AuthenticatedRequest } from "../middleware/auth";
import { getValidated, getValidatedParams, getValidatedQuery } from "../middleware/validate";
import * as assessmentService from "../services/assessment.service";
import { Errors } from "../utils/errors";
import { parseMultipart } from "../utils/multipart";
import { success } from "../utils/response";
import {
  type AssessmentIdParam,
  type ListAssessmentsQuery,
  type SubmitAssessmentBody,
  reportFormSchema,
  reportPayloadSchema,
} from "../validators/assessment.validator";

function fieldsFromZodIssues(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function submitAssessmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { auth } = req as AuthenticatedRequest;
    const body = getValidated<SubmitAssessmentBody>(req);
    const { assessmentId } = await assessmentService.submitAssessment(auth.sub, body);
    return success(res, "Assessment submitted", { assessmentId }, 201);
  } catch (err) {
    next(err);
  }
}

export async function uploadReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { auth } = req as AuthenticatedRequest;
    const { assessmentId } = getValidatedParams<AssessmentIdParam>(req);

    const { fields, files } = await parseMultipart(req, {
      maxBytes: env.REPORT_PDF_MAX_BYTES,
    });

    const formResult = reportFormSchema.safeParse(fields);
    if (!formResult.success) {
      return next(Errors.validation(fieldsFromZodIssues(formResult.error.issues)));
    }

    let parsedReport: unknown;
    try {
      parsedReport = JSON.parse(formResult.data.reportJson);
    } catch {
      return next(Errors.validation({ reportJson: "Must be a valid JSON string" }));
    }
    const payloadResult = reportPayloadSchema.safeParse(parsedReport);
    if (!payloadResult.success) {
      const fieldsErr = fieldsFromZodIssues(payloadResult.error.issues);
      const remapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldsErr)) {
        remapped[`reportJson.${k}`] = v;
      }
      return next(Errors.validation(remapped));
    }

    const pdfFile = files.pdfFile;
    if (!pdfFile) {
      return next(Errors.validation({ pdfFile: "Required" }));
    }

    const { reportId, pdfUrl } = await assessmentService.uploadAssessmentReport(
      auth.sub,
      assessmentId,
      {
        isAiGenerated: formResult.data.isAiGenerated,
        generatedAt: formResult.data.generatedAt,
        reportPayload: payloadResult.data,
        pdfFile,
      },
    );

    return success(res, "Report uploaded", { reportId, pdfUrl });
  } catch (err) {
    next(err);
  }
}

export async function listAssessmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { auth } = req as AuthenticatedRequest;
    const query = getValidatedQuery<ListAssessmentsQuery>(req);
    const result = await assessmentService.listAssessmentsForUser(auth.sub, {
      page: query.page,
      limit: query.limit,
    });
    return success(res, "Reports", result);
  } catch (err) {
    next(err);
  }
}

export async function getAssessmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { auth } = req as AuthenticatedRequest;
    const { assessmentId } = getValidatedParams<AssessmentIdParam>(req);
    const data = await assessmentService.getAssessmentDetail(auth.sub, assessmentId);
    return success(res, "Assessment detail", data);
  } catch (err) {
    next(err);
  }
}
