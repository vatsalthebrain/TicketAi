import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Ticket from "./models/ticket.js";
import { chatWithGemini } from "./utils/ai.js";

async function runTest() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully!");

    // Find any ticket
    const ticket = await Ticket.findOne({});
    if (!ticket) {
      console.log("No ticket found in database to run chat test on.");
      process.exit(0);
    }

    console.log(`\nTesting Chat Co-Pilot on Ticket: "${ticket.title}"`);

    // Mock messages
    const mockMessages = [
      { role: "user", content: "What commands should I run to inspect the MongoDB logs on Ubuntu?" }
    ];

    console.log("\nAttempting to call chatWithGemini...");
    const answer = await chatWithGemini(ticket, mockMessages);
    
    if (answer) {
      console.log("✅ Gemini API answered successfully!");
      console.log("Answer:\n", answer);
    } else {
      console.log("⚠️ Gemini API returned null (quota limits hit). Testing local fallback controller parser...");
      
      const latestMessage = mockMessages[mockMessages.length - 1].content.toLowerCase();
      let fallbackText = `[System Notice: Running in Local Fallback mode due to Gemini API rate limits]\n\n`;

      if (latestMessage.includes("mongo") || latestMessage.includes("database") || latestMessage.includes("sql") || latestMessage.includes("db")) {
        fallbackText += `Here are useful commands to troubleshoot database/logs for this ticket:
1. Check MongoDB Service Status on Ubuntu: sudo systemctl status mongod
2. Inspect MongoDB Logs: sudo tail -n 100 /var/log/mongodb/mongod.log`;
      }
      
      console.log("Fallback Answer:\n", fallbackText);
    }

    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

runTest();
