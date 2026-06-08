import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export let apiKeys = [];
export let currentKeyIndex = 0;

export const getApiKey = () => {
  if (apiKeys.length === 0) {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    apiKeys = rawKeys.split(",").map(k => k.trim()).filter(Boolean);
  }

  if (apiKeys.length === 0) {
    return null;
  }

  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
};

// Unified self-healing helper to post to Gemini with key rotation retries
export const postToGemini = async (modelAction, payload, generationConfig = null) => {
  if (apiKeys.length === 0) {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    apiKeys = rawKeys.split(",").map(k => k.trim()).filter(Boolean);
  }

  if (apiKeys.length === 0) {
    console.error("❌ No GEMINI_API_KEYS or GEMINI_API_KEY defined.");
    return null;
  }

  const attemptLimit = apiKeys.length;
  for (let attempt = 0; attempt < attemptLimit; attempt++) {
    const key = apiKeys[currentKeyIndex];
    // Rotate key index for the next request attempt
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:${modelAction}?key=${key}`;
    const maskedKey = key.substring(0, 8) + "..." + key.substring(key.length - 8);

    try {
      const body = { ...payload };
      if (generationConfig) {
        body.generationConfig = generationConfig;
      }

      console.log(`🤖 Attempting Gemini API call with Key #${currentKeyIndex === 0 ? apiKeys.length : currentKeyIndex} (${maskedKey})...`);
      
      const response = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" }
      });

      return response.data;
    } catch (e) {
      const errorMsg = e.response?.data?.error?.message || e.message;
      console.warn(`⚠️ Gemini API call failed with Key (${maskedKey}). Error: ${errorMsg}. Retrying with next key...`);
    }
  }

  console.error("❌ All configured Gemini API keys failed or were rate-limited.");
  return null;
};

export const analyzeTicket = async (ticket) => {
  try {
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

    const data = await postToGemini(
      "generateContent",
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        responseMimeType: "application/json"
      }
    );

    if (!data) return null;

    console.log("Successfully got response from Gemini API");
    const raw = data.candidates[0].content.parts[0].text;
    return raw;
  } catch (e) {
    console.error("Error during AI analysis:", e.message);
    return null;
  }
};

export const matchModerator = async (ticket, moderators) => {
  try {
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

Analyze the ticket's technical requirements and semantically match them against the skills of the available moderators/admins. 
CRITICAL RULE: Always prefer assigning the ticket to a moderator if they have any related skills. Only assign to an administrator if no moderator has any matching or related skills for the ticket.

Respond ONLY with a JSON object matching this schema:
{
  "assignedEmail": "email@example.com",
  "reason": "Explain briefly why this person is the best match based on their skills."
}`;

    const data = await postToGemini(
      "generateContent",
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        responseMimeType: "application/json"
      }
    );

    if (!data) return null;

    const raw = data.candidates[0].content.parts[0].text;
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
    console.error("Error during AI moderator matching:", e.message);
    return null;
  }
};

export const chatWithGemini = async (ticket, messages) => {
  try {
    const systemPrompt = `You are a helpful AI Co-Pilot helping a technical support moderator/admin resolve a support ticket.
Here is the ticket context:
- ID: ${ticket._id}
- Title: ${ticket.title}
- Description: ${ticket.description}
- Priority: ${ticket.priority || "medium"}
- Helpful Notes: ${ticket.helpfulNotes || "none"}
- Related Skills: ${JSON.stringify(ticket.relatedSkills || [])}

Please answer the moderator's questions based on this ticket context and your general technical knowledge.
CRITICAL LIMITS: Keep your answers extremely concise, short, and to-the-point (maximum of 2-3 sentences).
If providing a code snippet, command, or email template, provide ONLY the raw code/command/template with minimal or no explanatory text.`;

    const contents = [];
    let firstUserFound = false;
    messages.forEach((msg) => {
      let textContent = msg.content;
      if (msg.role === "user" && !firstUserFound) {
        textContent = `${systemPrompt}\n\nUser Question: ${msg.content}`;
        firstUserFound = true;
      }
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: textContent }]
      });
    });

    const data = await postToGemini(
      "generateContent",
      {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents
      }
    );

    if (!data) return null;

    const raw = data.candidates[0].content.parts[0].text;
    return raw;
  } catch (e) {
    console.error("Error during AI chat session:", e.message);
    return null;
  }
};

export default analyzeTicket;
