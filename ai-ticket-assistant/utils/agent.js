import Ticket from "../models/ticket.js";
import User from "../models/user.js";
import { sendMail } from "./mailer.js";
import analyzeTicket, { matchModerator } from "./ai.js";

/**
 * Background agent job for user signup.
 * Sends a welcome email to the newly registered user.
 */
export const processUserSignup = async (email) => {
  try {
    console.log("👤 Processing background signup for email:", email);
    const user = await User.findOne({ email });
    if (!user) {
      console.warn("⚠️ User no longer exists in our database:", email);
      return;
    }

    const subject = `Welcome to the app`;
    const message = `Hi,
\n\n
Thanks for signing up. We're glad to have you onboard!
`;
    await sendMail(user.email, subject, message);
    console.log("✅ Welcome email sent successfully to:", email);
  } catch (error) {
    console.error("❌ Error during background user signup processing:", error.message);
  }
};

/**
 * Background agent job for ticket creation.
 * 1. Sets status to TODO.
 * 2. Invokes Gemini to analyze the ticket title/description.
 * 3. Normalizes & saves the analysis.
 * 4. Assigns the most appropriate moderator based on skills.
 * 5. Sends an email notification to the assigned moderator.
 */
export const processTicketCreated = async (ticketId) => {
  try {
    console.log("🚀 Background agent processing ticket:", ticketId);

    // 1) Fetch ticket
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      console.error("❌ Ticket not found in DB:", ticketId);
      return;
    }

    // 2) Ensure initial status
    await Ticket.findByIdAndUpdate(ticket._id, { status: "TODO" });
    console.log("📝 Ticket status updated to TODO");

    // 3) AI Analysis
    const rawAiResponse = await analyzeTicket(ticket);
    console.log("🤖 Raw AI Response received:", rawAiResponse);

    let parsed;
    try {
      parsed =
        typeof rawAiResponse === "string"
          ? JSON.parse(rawAiResponse)
          : rawAiResponse || {};
    } catch (e) {
      console.error("❌ Failed to parse AI response, fallback to empty object:", e);
      parsed = {};
    }

    // Normalize shape
    const aiResponse = {
      summary: parsed.summary || "",
      priority: parsed.priority || "medium",
      helpfulNotes: parsed.helpfulNotes || "",
      relatedSkills: Array.isArray(parsed.relatedSkills)
        ? parsed.relatedSkills.filter(Boolean)
        : [],
    };

    // 4) Use AI output to update ticket
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
    console.log("📝 Ticket updated with AI analysis");

    let assignedUser = null;
    const allStaff = await User.find({ role: { $in: ["moderator", "admin"] } });

    if (allStaff.length > 0) {
      console.log("🤖 Invoking AI matching to assign moderator...");
      const ticketWithAnalysis = {
        _id: ticket._id,
        title: ticket.title,
        description: ticket.description,
        summary: aiResponse.summary,
      };

      const matchedEmail = await matchModerator(ticketWithAnalysis, allStaff);
      console.log(`🤖 AI recommended assigning ticket to: ${matchedEmail}`);

      if (matchedEmail) {
        assignedUser = await User.findOne({ email: matchedEmail });
      }
    }

    if (!assignedUser) {
      // Fallback: assign to the first admin in database
      console.log("⚠️ Fallback: Assigning to admin...");
      assignedUser = await User.findOne({ role: "admin" });
    }

    await Ticket.findByIdAndUpdate(ticket._id, {
      assignedTo: assignedUser ? assignedUser._id : null,
    });
    console.log(`👤 Ticket assigned to moderator/admin: ${assignedUser ? assignedUser.email : "none"}`);

    // 6) Notify moderator
    if (assignedUser) {
      const finalTicket = await Ticket.findById(ticket._id);
      
      const emailBody = `Hi,

A new ticket has been assigned to you.

--- Ticket Details ---
Title: ${finalTicket.title}
Status: ${finalTicket.status}
Priority: ${finalTicket.priority || "medium"}

Related Skills:
${finalTicket.relatedSkills && finalTicket.relatedSkills.length > 0 ? finalTicket.relatedSkills.join(", ") : "N/A"}

Helpful Notes:
${finalTicket.helpfulNotes || "No notes generated."}
`;

      await sendMail(
        assignedUser.email,
        `[Ticket Assigned] ${finalTicket.title}`,
        emailBody
      );
      console.log(`✉️ Assignment email sent to: ${assignedUser.email}`);
    }

    console.log("✅ Ticket processing completed successfully.");
  } catch (error) {
    console.error("❌ Error during background ticket processing:", error.message, error);
  }
};
