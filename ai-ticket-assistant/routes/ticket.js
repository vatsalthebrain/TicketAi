import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { createTicket, getTicket, getTickets, getAnalytics, resolveTicket, chatWithAssistant, addComment } from "../controllers/ticket.js";

const router = express.Router();

router.get("/", authenticate, getTickets);
router.get("/analytics", authenticate, getAnalytics);
router.get("/:id", authenticate, getTicket);
router.post("/:id/resolve", authenticate, resolveTicket);
router.post("/:id/chat", authenticate, chatWithAssistant);
router.post("/:id/comments", authenticate, addComment);
router.post("/", authenticate, createTicket);

export default router;
