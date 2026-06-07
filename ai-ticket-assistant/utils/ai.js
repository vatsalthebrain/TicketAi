import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const analyzeTicket = async (ticket) => {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY is not defined in environment variables.");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log("🤖 Requesting Gemini analysis for ticket:", ticket._id);

    const prompt = `You are an expert AI assistant that processes technical support tickets. 

Your job is to:
1. Summarize the issue.
2. Estimate its priority.
3. Provide helpful notes and resource links for human moderators.
4. List relevant technical skills required.

Respond with a JSON object containing the following keys:
- summary: A short 1-2 sentence summary of the issue.
- priority: One of "low", "medium", or "high".
- helpfulNotes: A detailed technical explanation that a moderator can use to solve this issue. Include useful external links or resources if possible.
- relatedSkills: An array of relevant technical skills required (e.g., ["React", "MongoDB", "Node.js"]).

Ticket details:
- Title: ${ticket.title}
- Description: ${ticket.description}`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Successfully got response from Gemini API");
    const raw = response.data.candidates[0].content.parts[0].text;
    return raw;
  } catch (e) {
    console.error("Error during AI analysis: " + (e.response?.data ? JSON.stringify(e.response.data) : e.message));
    return null;
  }
};

export const matchModerator = async (ticket, moderators) => {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY is not defined in environment variables.");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log("🤖 Requesting Gemini to assign moderator for ticket:", ticket._id);

    const moderatorsList = moderators.map(mod => ({
      email: mod.email,
      role: mod.role,
      skills: mod.skills || []
    }));

    const prompt = `You are an expert resource coordinator. Your job is to assign a technical support ticket to the best matching moderator/admin based on their skills and role.

Ticket details:
- Title: ${ticket.title}
- Description: ${ticket.description}
- AI Summary: ${ticket.summary || ""}

Available moderators/admins:
${JSON.stringify(moderatorsList, null, 2)}

Analyze the ticket's technical requirements and semantically match them against the skills of the available moderators. If no moderator is a good fit, assign it to an administrator.

Respond ONLY with a JSON object matching this schema:
{
  "assignedEmail": "email@example.com",
  "reason": "Explain briefly why this person is the best match based on their skills."
}`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.candidates[0].content.parts[0].text;
    console.log("🤖 Moderator assignment AI Response:", raw);

    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    } catch (e) {
      console.error("❌ Failed to parse moderator assignment AI response:", e);
      parsed = {};
    }

    return parsed.assignedEmail || null;
  } catch (e) {
    console.error("Error during AI moderator matching:", e.response?.data ? JSON.stringify(e.response.data) : e.message);
    return null;
  }
};

export default analyzeTicket;
