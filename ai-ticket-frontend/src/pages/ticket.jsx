import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../config";

export default function TicketDetailsPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  // AI Assistant Chat States
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I am your AI Co-Pilot. I have loaded this ticket's context. How can I assist you with debugging, drafting response emails, or resolving this issue today?"
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Discussion Thread States
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const fetchTicket = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/tickets/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();

      if (res.ok) {
        setTicket(data.ticket);
        setComments(data.ticket.comments || []);
      } else {
        alert(data.message || "Failed to fetch ticket");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [id]);

  const handleResolve = async () => {
    if (!window.confirm("Are you sure you want to mark this ticket as resolved?")) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/tickets/${id}/resolve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (res.ok) {
        fetchTicket();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to resolve ticket");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  const handleSendMessage = async (customMessage) => {
    const textToSend = customMessage || chatInput;
    if (!textToSend.trim()) return;

    const newMessages = [...chatMessages, { role: "user", content: textToSend }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/tickets/${id}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: newMessages
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setChatMessages([...newMessages, { role: "assistant", content: data.answer }]);
      } else {
        setChatMessages([
          ...newMessages,
          { role: "assistant", content: `❌ Error: ${data.error || "Failed to communicate with AI Co-Pilot."}` }
        ]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: "❌ Network error: Could not reach AI Co-Pilot." }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    setCommentLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/tickets/${id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: commentInput
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setComments(data.comments || []);
        setCommentInput("");
      } else {
        alert(data.error || "Failed to post comment");
      }
    } catch (err) {
      console.error(err);
      alert("Network error: Could not send reply.");
    } finally {
      setCommentLoading(false);
    }
  };

  if (loading)
    return <div className="text-center mt-10">Loading ticket details...</div>;
  if (!ticket) return <div className="text-center mt-10">Ticket not found</div>;

  const isStaff = user.role === "admin" || user.role === "moderator";

  const renderDiscussionThread = (extraClasses = "") => (
    <div className={`card bg-gray-800 border border-gray-700/50 shadow-xl p-6 rounded-2xl space-y-4 ${extraClasses}`}>
      <h3 className="text-lg font-bold text-white border-b border-gray-700/50 pb-3 flex items-center justify-between">
        <span>Discussion Thread</span>
        <span className="badge badge-primary font-bold">{comments.length} Comments</span>
      </h3>

      {/* Comments List */}
      <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
        {comments.map((comment, idx) => {
          const isMe = comment.senderEmail === user.email;
          return (
            <div key={idx} className={`chat ${isMe ? "chat-end" : "chat-start"}`}>
              <div className="chat-header text-gray-400 text-[10px] mb-1 font-semibold flex gap-1.5 items-center">
                <span>{comment.senderEmail}</span>
                <span>•</span>
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
              </div>
              <div className={`chat-bubble text-xs font-semibold ${
                isMe 
                  ? "bg-primary text-primary-content" 
                  : "bg-gray-900 text-gray-200 border border-gray-700/50"
              }`}>
                {comment.content}
              </div>
            </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-gray-400 text-xs text-center py-6">No messages in this thread yet. Start the conversation below!</p>
        )}
      </div>

      {/* Post a Comment Form */}
      <form onSubmit={handlePostComment} className="flex gap-2 border-t border-gray-700/50 pt-4">
        <input
          type="text"
          placeholder="Type a message to reply..."
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          className="input input-bordered input-sm flex-1 bg-gray-900 border-gray-700 text-xs focus:border-primary text-white"
          disabled={commentLoading}
          required
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm px-4 text-xs font-bold"
          disabled={commentLoading}
        >
          {commentLoading ? "Sending..." : "Reply"}
        </button>
      </form>
    </div>
  );

  return (
    <div className={`mx-auto p-4 ${isStaff ? "max-w-6xl" : "max-w-3xl"}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Ticket Details</h2>
        {isStaff && ticket.status !== "RESOLVED" && (
          <button className="btn btn-success btn-sm font-semibold" onClick={handleResolve}>
            Mark as Resolved
          </button>
        )}
      </div>

      <div className={`grid grid-cols-1 ${isStaff ? "lg:grid-cols-12" : ""} gap-6`}>
        {/* Left Column: Ticket details & Comments thread for non-staff */}
        <div className={isStaff ? "lg:col-span-7" : "w-full"}>
          <div className="card bg-gray-800 border border-gray-700/50 shadow-xl p-6 space-y-4 rounded-2xl">
            <h3 className="text-xl font-semibold text-white">{ticket.title}</h3>
            <p className="text-gray-300 leading-relaxed">{ticket.description}</p>

            {/* Conditionally render extended details */}
            {ticket.status && (
              <>
                <div className="divider border-gray-700/50">Metadata</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <p className="text-gray-400">
                    <strong className="text-gray-300 font-semibold">Status:</strong>{" "}
                    <span className={`badge badge-sm font-bold capitalize ${
                      ticket.status === "RESOLVED" ? "badge-success" : 
                      ticket.status === "IN_PROGRESS" ? "badge-warning" : "badge-info"
                    }`}>{ticket.status}</span>
                  </p>
                  {ticket.priority && (
                    <p className="text-gray-400">
                      <strong className="text-gray-300 font-semibold">Priority:</strong>{" "}
                      <span className={`badge badge-sm font-bold capitalize ${
                        ticket.priority === "high" ? "badge-error" : 
                        ticket.priority === "medium" ? "badge-warning" : "badge-success"
                      }`}>{ticket.priority}</span>
                    </p>
                  )}
                </div>

                {ticket.relatedSkills?.length > 0 && (
                  <p className="text-sm text-gray-400">
                    <strong className="text-gray-300 font-semibold">Related Skills:</strong>{" "}
                    {ticket.relatedSkills.join(", ")}
                  </p>
                )}

                {ticket.helpfulNotes && (
                  <div className="mt-4">
                    <strong className="text-gray-300 font-semibold text-sm block mb-1">Helpful Notes:</strong>
                    <div className="prose max-w-none text-gray-300 bg-gray-900/60 p-4 rounded-xl border border-gray-700/50 mt-1 leading-relaxed text-sm">
                      <ReactMarkdown>{ticket.helpfulNotes}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {ticket.assignedTo && (
                  <p className="text-sm text-gray-400">
                    <strong className="text-gray-300 font-semibold">Assigned To:</strong> {ticket.assignedTo?.email}
                  </p>
                )}

                {ticket.createdAt && (
                  <p className="text-xs text-gray-500 mt-4">
                    Created At: {new Date(ticket.createdAt).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Discussion Thread / Comment Box (only shown here for non-staff) */}
          {!isStaff && renderDiscussionThread("mt-6")}
        </div>

        {/* Right Column: AI Co-Pilot Chat Widget & Discussion Thread (Moderators/Admins Only) */}
        {isStaff && (
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* AI Co-Pilot Chat Widget */}
            <div className="flex flex-col h-[550px] bg-gray-800 border border-gray-700/50 shadow-xl rounded-2xl p-4">
              <div className="flex items-center gap-2 border-b border-gray-700/50 pb-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">AI Co-Pilot Assistant</h3>
              </div>

              {/* Quick Action Chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  disabled={chatLoading}
                  onClick={() => handleSendMessage("Draft a reply email explaining that we are looking into the issue")}
                  className="btn btn-xs btn-outline btn-primary rounded-full font-semibold text-[10px]"
                >
                  ✉️ Draft Email
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1 text-sm scrollbar-thin">
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`chat ${msg.role === "user" ? "chat-end" : "chat-start"}`}
                  >
                    <div className={`chat-bubble max-w-[90%] text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-content font-medium"
                        : "bg-gray-900 text-gray-200 border border-gray-700/50"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose max-w-none prose-invert text-xs">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat chat-start">
                    <div className="chat-bubble bg-gray-900 text-gray-200 border border-gray-700/50 max-w-[90%] text-xs flex items-center gap-1">
                      <span className="loading loading-dots loading-xs text-primary"></span>
                      <span>AI Co-Pilot is thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2 border-t border-gray-700/50 pt-3"
              >
                <input
                  type="text"
                  placeholder="Ask follow-up questions about this ticket..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="input input-bordered input-sm flex-1 bg-gray-900 border-gray-700 text-xs focus:border-primary text-white"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm px-4 text-xs font-bold"
                  disabled={chatLoading}
                >
                  Send
                </button>
              </form>
            </div>

            {/* Discussion Thread / Comment Box (placed below AI Co-Pilot for staff) */}
            {renderDiscussionThread()}
          </div>
        )}
      </div>
    </div>
  );
}
