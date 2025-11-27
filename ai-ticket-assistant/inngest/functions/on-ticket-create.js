import { inngest } from "../client.js";
import Ticket from "../../models/ticket.js";
import User from "../../models/user.js";
import { NonRetriableError } from "inngest";
import { sendMail } from "../../utils/mailer.js";
import analyzeTicket from "../../utils/ai.js";

export const onTicketCreated = inngest.createFunction(
  { id: "on-ticket-created", retries: 1 },
  { event: "ticket/created" },
  async ({ event, step }) => {
    try {
      const { ticketId } = event.data;
      console.log("🚀 Processing ticket:", ticketId);

      // 1) Fetch ticket
      const ticket = await step.run("fetch-ticket", async () => {
        const ticketObject = await Ticket.findById(ticketId);
        if (!ticketObject) {
          throw new NonRetriableError("Ticket not found");
        }
        return ticketObject;
      });

      // 2) Ensure initial status
      await step.run("update-ticket-status", async () => {
        await Ticket.findByIdAndUpdate(ticket._id, { status: "TODO" });
      });

      // 3) 🔥 Single AI call, wrapped in step.run
      const aiResponse = await step.run("ai-analysis", async () => {
        const rawAiResponse = await analyzeTicket(ticket);

        console.log("🤖 Raw AI Response:", rawAiResponse);

        let parsed;
        try {
          parsed =
            typeof rawAiResponse === "string"
              ? JSON.parse(rawAiResponse)
              : rawAiResponse || {};
        } catch (e) {
          console.error("❌ Failed to parse AI response:", e);
          parsed = {};
        }

        // Normalize shape so later steps are safe
        const normalized = {
          summary: parsed.summary || "",
          priority: parsed.priority || "medium",
          helpfulNotes: parsed.helpfulNotes || "",
          relatedSkills: Array.isArray(parsed.relatedSkills)
            ? parsed.relatedSkills.filter(Boolean)
            : [],
        };

        return normalized;
      });

      // 4) Use AI output to update ticket
      const relatedskills =
        (await step.run("ai-processing", async () => {
          if (!aiResponse) return [];

          const normalizedPriority = String(aiResponse.priority).toLowerCase();
          const priority = ["low", "medium", "high"].includes(normalizedPriority)
            ? normalizedPriority
            : "medium";

          const skills = aiResponse.relatedSkills || [];

          await Ticket.findByIdAndUpdate(ticket._id, {
            priority,
            helpfulNotes: aiResponse.helpfulNotes || "",
            status: "IN_PROGRESS",
            relatedSkills: skills,
          });

          return skills;
        })) || [];

      // 5) Assign moderator based on skills
      const moderator = await step.run("assign-moderator", async () => {
        let user;

        if (relatedskills.length > 0) {
          user = await User.findOne({
            role: "moderator",
            skills: {
              $elemMatch: {
                $regex: relatedskills.join("|"),
                $options: "i",
              },
            },
          });
        } else {
          user = await User.findOne({ role: "moderator" });
        }

        if (!user) {
          user = await User.findOne({ role: "admin" });
        }

        await Ticket.findByIdAndUpdate(ticket._id, {
          assignedTo: user?._id || null,
        });

        return user;
      });

      // 6) Notify moderator
      await step.run("send-email-notification", async () => {
        if (moderator) {
          const finalTicket = await Ticket.findById(ticket._id);
          await sendMail(
            moderator.email,
            "Ticket Assigned",
            `A new ticket is assigned to you: ${finalTicket.title}`
          );
        }
      });

      return { success: true };
    } catch (err) {
      console.error("❌ Error running the step", err.message, err);
      return { success: false };
    }
  }
);
