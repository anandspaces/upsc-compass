import { Router } from "express";
import authRoutes from "./auth.routes";

const router: Router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: 1, service: "upsccompass-auth-api", time: new Date().toISOString() });
});

router.use("/auth", authRoutes);

export default router;
