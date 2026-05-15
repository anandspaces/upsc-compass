import { Router } from "express";
import * as ctrl from "../controllers/assessment.controller";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import {
  assessmentIdParamSchema,
  listAssessmentsQuerySchema,
  submitAssessmentSchema,
} from "../validators/assessment.validator";

const router: Router = Router();

router.post(
  "/submit",
  requireAuth,
  validateBody(submitAssessmentSchema),
  ctrl.submitAssessmentHandler,
);

router.post(
  "/:assessmentId/report",
  requireAuth,
  validateParams(assessmentIdParamSchema),
  ctrl.uploadReportHandler,
);

router.get(
  "/",
  requireAuth,
  validateQuery(listAssessmentsQuerySchema),
  ctrl.listAssessmentsHandler,
);

router.get(
  "/:assessmentId",
  requireAuth,
  validateParams(assessmentIdParamSchema),
  ctrl.getAssessmentHandler,
);

export default router;
