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
    let aiResponse;
    if (!rawAiResponse) {
      console.log("⚠️ Gemini API returned null (quota exceeded or network error). Using local fallback analysis...");
      aiResponse = generateFallbackAnalysis(ticket);
    } else {
      let notes = parsed.helpfulNotes || "";
      if (Array.isArray(notes)) {
        notes = notes.map(n => `- ${n}`).join("\n");
      }
      aiResponse = {
        summary: parsed.summary || "",
        priority: parsed.priority || "medium",
        helpfulNotes: notes,
        relatedSkills: Array.isArray(parsed.relatedSkills)
          ? parsed.relatedSkills.filter(Boolean)
          : [],
      };
    }

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

      let matchedEmail = null;
      try {
        matchedEmail = await matchModerator(ticketWithAnalysis, allStaff);
      } catch (err) {
        console.error("❌ AI moderator matching error:", err);
      }
      console.log(`🤖 AI recommended assigning ticket to: ${matchedEmail}`);

      if (matchedEmail && typeof matchedEmail === "string") {
        assignedUser = await User.findOne({ email: matchedEmail.toLowerCase().trim() });
      }

      if (!assignedUser) {
        console.log("⚠️ AI matching did not find a valid moderator user. Using local skill-based matching...");
        assignedUser = findBestModeratorLocally(ticket, allStaff);
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

export function generateFallbackAnalysis(ticket) {
  const title = (ticket.title || "").toLowerCase();
  const description = (ticket.description || "").toLowerCase();
  const text = `${title} ${description}`;

  let priority = "medium";
  if (text.includes("urgent") || text.includes("critical") || text.includes("broken") || text.includes("error") || text.includes("fail") || text.includes("crash") || text.includes("payment")) {
    priority = "high";
  } else if (text.includes("warning") || text.includes("slow") || text.includes("issue") || text.includes("wrong")) {
    priority = "medium";
  } else {
    priority = "low";
  }

  // Extract skills based on keywords
  const skillsList = [];
  if (text.includes("react") || text.includes("frontend") || text.includes("css") || text.includes("color") || text.includes("colour") || text.includes("panel") || text.includes("signup") || text.includes("singup") || text.includes("login") || text.includes("page")) {
    skillsList.push("React");
  }
  if (text.includes("database") || text.includes("sql") || text.includes("mongodb") || text.includes("mongo") || text.includes("mongoose") || text.includes("pnb")) {
    skillsList.push("MongoDB");
  }
  if (text.includes("backend") || text.includes("api") || text.includes("server") || text.includes("routes") || text.includes("node") || text.includes("express") || text.includes("payment") || text.includes("gateway") || text.includes("auth")) {
    skillsList.push("Node.js");
  }
  if (text.includes("pnb") || text.includes("data entry") || text.includes("hdfc")) {
    skillsList.push("Database Management");
    skillsList.push("Data Validation");
  }

  // Construct helpful notes based on matched skills
  let notes = `### Quick Troubleshooting Guide\n\n`;
  notes += `This ticket was processed using the local matching system because the AI quota was exceeded.\n\n`;
  
  if (skillsList.includes("React")) {
    notes += `- **Frontend issue detected:** Inspect the react components in \`ai-ticket-frontend/src\`. Check style files and developer console logs for frontend syntax or rendering errors.\n`;
  }
  if (skillsList.includes("MongoDB")) {
    notes += `- **Database issue detected:** Verify that MongoDB is running and that the connection URI in the \`.env\` file is correct. Inspect the model schema definitions in \`models/\`.\n`;
  }
  if (skillsList.includes("Node.js")) {
    notes += `- **Backend issue detected:** Check server logs for API endpoint crashes or middleware authentication failures. Verify the routes are registered correctly in \`routes/\`.\n`;
  }
  if (skillsList.includes("Database Management")) {
    notes += `- **Data Entry / Validation issue:** Check input sanitation and database save logic in the controllers to ensure all required fields are provided and formatted correctly.\n`;
  }
  
  notes += `\nPlease contact the system administrator if you need further logs or assistance.`;

  return {
    summary: `Local analysis: ${ticket.title}`,
    priority,
    helpfulNotes: notes,
    relatedSkills: skillsList
  };
}

export function findBestModeratorLocally(ticket, staffMembers) {
  const title = (ticket.title || "").toLowerCase();
  const description = (ticket.description || "").toLowerCase();
  const textToSearch = `${title} ${description}`;

  const skillKeywordsMap = {
    "react": ["react", "frontend", "ui", "interface", "css", "color", "colour", "panel", "signup", "singup", "login", "button", "design", "page", "html", "style"],
    "dashboard": ["dashboard", "analytics", "chart", "graph", "metric"],
    "database administrator": ["database", "db", "sql", "mongodb", "mongo", "query", "schemas", "index", "connection", "mongoose", "pnb", "data"],
    "database": ["database", "db", "sql", "mongodb", "mongo", "query", "schemas", "index", "connection", "mongoose", "pnb", "data"],
    "sql": ["sql", "database", "query", "mysql", "postgres"],
    "mongodb": ["mongodb", "mongo", "mongoose", "nosql"],
    "backend": ["backend", "api", "server", "routes", "node", "express", "payment", "gateway", "stripe", "webhook", "auth", "token", "jwt", "email", "mail"],
    "node": ["node", "nodejs", "javascript", "backend", "api", "server"],
    "express": ["express", "router", "routes", "middleware", "api"],
    "authentication": ["auth", "token", "jwt", "login", "signup", "singup", "password", "session"]
  };

  let bestStaff = null;
  let maxScore = -1;

  for (const member of staffMembers) {
    let score = 0;
    const skills = (member.skills || []).map(s => s.toLowerCase());

    for (const skill of skills) {
      // 1. Direct match of skill in text
      if (textToSearch.includes(skill)) {
        score += 5;
      }

      // 2. Keyword synonyms match
      for (const [key, keywords] of Object.entries(skillKeywordsMap)) {
        if (skill.includes(key) || key.includes(skill)) {
          for (const kw of keywords) {
            if (textToSearch.includes(kw)) {
              score += 2;
            }
          }
        }
      }
    }

    // Preference to moderator role for support tickets
    if (member.role === "moderator") {
      score += 20.0;
    }

    if (score > maxScore) {
      maxScore = score;
      bestStaff = member;
    }
  }

  // If no score matched any keyword, return the first moderator, or if none, the first admin
  if (maxScore <= 0.5) {
    const modsOnly = staffMembers.filter(m => m.role === "moderator");
    if (modsOnly.length > 0) {
      return modsOnly[0];
    }
    return staffMembers[0];
  }

  return bestStaff;
}
