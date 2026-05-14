import { Router } from "express";
import * as ctrl from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  loginSchema,
  registerSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from "../validators/auth.validator";

const router: Router = Router();

router.post("/register", validateBody(registerSchema), ctrl.registerHandler);
router.post("/verify-otp", validateBody(verifyOtpSchema), ctrl.verifyOtpHandler);
router.post("/resend-otp", validateBody(resendOtpSchema), ctrl.resendOtpHandler);
router.post("/login", validateBody(loginSchema), ctrl.loginHandler);
router.post("/logout", requireAuth, ctrl.logoutHandler);

export default router;
