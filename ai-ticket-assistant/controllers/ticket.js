import { processTicketCreated } from "../utils/agent.js";
import Ticket from "../models/ticket.js";
import User from "../models/user.js";
import { chatWithGemini } from "../utils/ai.js";

export const createTicket = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "Title and description are required" });
    }
    const newTicket = await Ticket.create({
      title,
      description,
      createdBy: req.user._id.toString(),
    });

    processTicketCreated(newTicket._id.toString()).catch((err) =>
      console.error("❌ Error running processTicketCreated:", err)
    );

    return res.status(201).json({
      message: "Ticket created and processing started",
      ticket: newTicket,
    });
  } catch (error) {
    console.error("Error creating ticket", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getTickets = async (req, res) => {
  try {
    const user = req.user;
    let tickets = [];
    if (user.role === "admin") {
      tickets = await Ticket.find({})
        .populate("assignedTo", ["email", "_id"])
        .sort({ createdAt: -1 });
    } else if (user.role === "moderator") {
      tickets = await Ticket.find({ assignedTo: user._id })
        .populate("assignedTo", ["email", "_id"])
        .sort({ createdAt: -1 });
    } else {
      tickets = await Ticket.find({ createdBy: user._id })
        .select("title description status createdAt")
        .sort({ createdAt: -1 });
    }
    return res.status(200).json(tickets);
  } catch (error) {
    console.error("Error fetching tickets", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getTicket = async (req, res) => {
  try {
    const user = req.user;
    let ticket;
    console.log("User role:", user);

    if (user.role === "admin") {
      ticket = await Ticket.findById(req.params.id).populate("assignedTo", [
        "email",
        "_id",
      ]);
    } else if (user.role === "moderator") {
      ticket = await Ticket.findOne({
        _id: req.params.id,
        assignedTo: user._id,
      }).populate("assignedTo", [
        "email",
        "_id",
      ]);
    } else {
      ticket = await Ticket.findOne({
        createdBy: user._id,
        _id: req.params.id,
      }).populate("assignedTo", [
        "email",
        "_id",
      ]);
    }

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }
    return res.status(200).json({ ticket });
  } catch (error) {
    console.error("Error fetching ticket", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 1) Total tickets
    const totalTickets = await Ticket.countDocuments();

    // 2) Status breakdown
    const todoCount = await Ticket.countDocuments({ status: "TODO" });
    const inProgressCount = await Ticket.countDocuments({ status: "IN_PROGRESS" });
    const resolvedCount = await Ticket.countDocuments({ status: "RESOLVED" });

    // 3) Priority breakdown
    const highCount = await Ticket.countDocuments({ priority: "high" });
    const mediumCount = await Ticket.countDocuments({ priority: "medium" });
    const lowCount = await Ticket.countDocuments({ priority: "low" });
    const unsetCount = await Ticket.countDocuments({ priority: { $exists: false } });

    // 4) Moderator workload
    const staff = await User.find({ role: { $in: ["moderator", "admin"] } }).select("email role");
    const workload = await Promise.all(
      staff.map(async (member) => {
        const count = await Ticket.countDocuments({ assignedTo: member._id, status: { $ne: "RESOLVED" } });
        return {
          email: member.email,
          role: member.role,
          activeTickets: count,
        };
      })
    );

    return res.status(200).json({
      totalTickets,
      statusBreakdown: {
        todo: todoCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
      },
      priorityBreakdown: {
        high: highCount,
        medium: mediumCount + unsetCount,
        low: lowCount,
      },
      workload,
    });
  } catch (error) {
    console.error("❌ Error fetching analytics:", error);
    return res.status(500).json({ message: "Internal Server Error", details: error.message });
  }
};

export const resolveTicket = async (req, res) => {
  try {
    if (req.user?.role === "user") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ticketId = req.params.id;
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // If moderator, ensure the ticket is assigned to them
    if (req.user.role === "moderator" && ticket.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden: You can only resolve tickets assigned to you." });
    }

    ticket.status = "RESOLVED";
    await ticket.save();

    return res.status(200).json({ message: "Ticket marked as resolved successfully", ticket });
  } catch (error) {
    console.error("❌ Error resolving ticket:", error);
    return res.status(500).json({ message: "Internal Server Error", details: error.message });
  }
};

export const chatWithAssistant = async (req, res) => {
  try {
    if (req.user?.role === "user") {
      return res.status(403).json({ error: "Forbidden: Only staff can use AI Co-Pilot." });
    }

    const ticketId = req.params.id;
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // If moderator, ensure the ticket is assigned to them
    if (req.user.role === "moderator" && ticket.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Forbidden: You can only chat about tickets assigned to you." });
    }

    // Call Gemini API
    let answer = await chatWithGemini(ticket, messages);

    // Local Fallback mode when API limit is reached
    if (!answer) {
      console.log("⚠️ Chat Co-Pilot fallback triggered due to Gemini failure/rate-limit.");
      const latestMessage = messages[messages.length - 1].content.toLowerCase();

      let fallbackText = `[System Notice: Running in Local Fallback mode due to Gemini API rate limits]\n\n`;

      if (latestMessage.includes("email") || latestMessage.includes("draft") || latestMessage.includes("reply")) {
        fallbackText += `Here is a drafted email template for this ticket ("${ticket.title}"):

\`\`\`
Subject: Update regarding Ticket #${ticket._id.toString().substring(18)}: ${ticket.title}

Dear User,

Thank you for reaching out to us. We are currently looking into the issue you reported:
"${ticket.description}"

Our support team has assigned a database/frontend moderator to investigate this further. We will keep you updated as we progress.

Best regards,
TicketAI Support Team
\`\`\``;
      } else if (latestMessage.includes("mongo") || latestMessage.includes("database") || latestMessage.includes("sql") || latestMessage.includes("db")) {
        fallbackText += `Here are useful commands to troubleshoot database/logs for this ticket:

1. **Check MongoDB Service Status on Ubuntu**:
   \`\`\`bash
   sudo systemctl status mongod
   \`\`\`

2. **Inspect MongoDB Logs**:
   \`\`\`bash
   sudo tail -n 100 /var/log/mongodb/mongod.log
   \`\`\`

3. **Check current database size/connections**:
   Connect via shell:
   \`\`\`bash
   mongosh "your-mongo-uri"
   \`\`\`
   And run:
   \`\`\`javascript
   db.serverStatus().connections;
   \`\`\``;
      } else if (latestMessage.includes("react") || latestMessage.includes("frontend") || latestMessage.includes("css") || latestMessage.includes("style")) {
        fallbackText += `Here are frontend diagnostic steps for this ticket:

1. **Inspect Local Developer Console**:
   Press \`Cmd+Option+I\` (Mac) or \`F12\` (Windows/Linux) and check the **Console** tab for active JavaScript errors.

2. **Verify Port & Endpoint**:
   Check that Vite is running and that your \`.env\` file has the correct \`VITE_SERVER_URL\` (e.g. \`http://localhost:3000/api\`).

3. **Clear Local Cache**:
   Perform a hard reload (\`Cmd+Shift+R\`) to make sure style sheets and states are completely refreshed.`;
      } else {
        fallbackText += `I am currently running in offline fallback mode because the Gemini API is rate-limited. 
If you need database diagnostic commands (type "mongo commands"), email drafts (type "draft email"), or frontend help (type "react help"), please ask for those specifically!`;
      }

      answer = fallbackText;
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("❌ Error in chatWithAssistant controller:", error);
    return res.status(500).json({ message: "Internal Server Error", details: error.message });
  }
};
