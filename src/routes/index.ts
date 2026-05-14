import { Router } from "express";
import { success } from "../utils/response";
import authRoutes from "./auth.routes";

const router: Router = Router();

router.get("/health", (_req, res) => {
  success(res, "ok", { service: "upsccompass-auth-api", time: new Date().toISOString() });
});

router.use("/auth", authRoutes);

export default router;
