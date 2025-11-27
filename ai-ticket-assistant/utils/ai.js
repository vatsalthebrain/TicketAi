import axios from "axios";
import dotenv from "dotenv";

const analyzeTicket = async (ticket) => {
  try{
    const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
    console.log(ticket);
  const response = await axios.post(OPENROUTER_API_URL,{
    model: "x-ai/grok-4.1-fast:free",
    messages: [
      {
        role: "system",
        content: `You are an expert AI assistant that processes technical support tickets. 

Your job is to:
1. Summarize the issue.
2. Estimate its priority.
3. Provide helpful notes and resource links for human moderators.
4. List relevant technical skills required.

IMPORTANT:
- Respond with *only* valid raw JSON.
- Do NOT include markdown, code fences, comments, or any extra formatting.
- The format must be a raw JSON object.

Repeat: Do not wrap your output in markdown or code fences.`,
      },
      {
        role:"user",
        content: `Analyze the following support ticket and provide a JSON object with:

- summary: A short 1-2 sentence summary of the issue.
- priority: One of "low", "medium", or "high".
- helpfulNotes: A detailed technical explanation that a moderator can use to solve this issue. Include useful external links or resources if possible.
- relatedSkills: An array of relevant skills required to solve the issue (e.g., ["React", "MongoDB"]).

Respond ONLY in this JSON format and do not include any other text or markdown in the answer:

{
"summary": "Short summary of the ticket",
"priority": "high",
"helpfulNotes": "Here are useful tips...",
"relatedSkills": ["React", "Node.js"]
}

---

Ticket information:

- Title: ${ticket.title}
- Description: ${ticket.description}`
      },],
    max_tokens: 1024,
            temperature: 0.3,
  },
{
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
});
 console.log(`Successfully got response from ` + OPENROUTER_API_URL);
 const raw= response.data.choices[0].message.content;
 return raw;
    }catch(e){
      console.log("Error during AI analysis: " + e.message);
      return null;
    }
  
};

export default analyzeTicket;
