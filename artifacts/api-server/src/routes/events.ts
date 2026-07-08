import { Router, type IRouter } from "express";
import { addSseClient } from "../lib/sse";

const router: IRouter = Router();

router.get("/events", (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Keep alive ping every 30s
  const interval = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(interval);
    }
  }, 30000);

  res.on("close", () => clearInterval(interval));

  addSseClient(res);
});

export default router;
