import { useEffect, useState } from "react";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ role: "", skills: "" });
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState("analytics");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    fetchUsers();
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/tickets/analytics`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setAnalytics(data);
      } else {
        console.error("Failed to fetch analytics", data.error);
      }
    } catch (err) {
      console.error("Error fetching analytics", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user? This will also unassign all their tickets.")) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/auth/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        fetchUsers();
        fetchAnalytics();
      } else {
        alert(data.error || "Failed to delete user");
      }
    } catch (err) {
      console.error("Delete failed", err);
      alert("Something went wrong");
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/auth/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data);
        setFilteredUsers(data);
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error("Error fetching users", err);
    }
  };

  const handleEditClick = (user) => {
    setEditingUser(user.email);
    setFormData({
      role: user.role,
      skills: user.skills?.join(", "),
    });
  };

  const handleUpdate = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/auth/update-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: editingUser,
            role: formData.role,
            skills: formData.skills
              .split(",")
              .map((skill) => skill.trim())
              .filter(Boolean),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        console.error(data.error || "Failed to update user");
        return;
      }

      setEditingUser(null);
      setFormData({ role: "", skills: "" });
      fetchUsers();
      fetchAnalytics();
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    setFilteredUsers(
      users.filter((user) => user.email.toLowerCase().includes(query))
    );
  };

  const maxPriorityCount = Math.max(
    analytics?.priorityBreakdown?.high || 0,
    analytics?.priorityBreakdown?.medium || 0,
    analytics?.priorityBreakdown?.low || 0,
    1
  );

  const getBarHeight = (count) => {
    return `${(count / maxPriorityCount) * 100}%`;
  };

  return (
    <div className="max-w-4xl mx-auto mt-10 px-4">
      <h1 className="text-3xl font-extrabold mb-8 text-white tracking-tight">Admin Console</h1>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-8 bg-gray-800/60 border border-gray-700/50 p-1 rounded-xl w-fit">
        <button
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "analytics"
              ? "bg-primary text-primary-content shadow"
              : "text-gray-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("analytics")}
        >
          Analytics Dashboard
        </button>
        <button
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === "users"
              ? "bg-primary text-primary-content shadow"
              : "text-gray-400 hover:text-white"
          }`}
          onClick={() => {
            setActiveTab("users");
            fetchUsers();
          }}
        >
          User Management
        </button>
      </div>

      {activeTab === "analytics" ? (
        analyticsLoading ? (
          <div className="text-center py-20">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <p className="mt-4 text-gray-400">Loading Dashboard Metrics...</p>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-indigo-900/60 to-indigo-950/60 p-5 rounded-2xl border border-indigo-700/40 shadow-xl text-white backdrop-blur">
                <p className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">Total Tickets</p>
                <h3 className="text-4xl font-black mt-2">{analytics?.totalTickets || 0}</h3>
              </div>
              <div className="bg-gradient-to-br from-blue-900/60 to-blue-950/60 p-5 rounded-2xl border border-blue-700/40 shadow-xl text-white backdrop-blur">
                <p className="text-xs uppercase tracking-wider text-blue-300 font-semibold">To Do</p>
                <h3 className="text-4xl font-black mt-2">{analytics?.statusBreakdown?.todo || 0}</h3>
              </div>
              <div className="bg-gradient-to-br from-amber-900/60 to-amber-950/60 p-5 rounded-2xl border border-amber-700/40 shadow-xl text-white backdrop-blur">
                <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold">In Progress</p>
                <h3 className="text-4xl font-black mt-2">{analytics?.statusBreakdown?.inProgress || 0}</h3>
              </div>
              <div className="bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 p-5 rounded-2xl border border-emerald-700/40 shadow-xl text-white backdrop-blur">
                <p className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">Resolved</p>
                <h3 className="text-4xl font-black mt-2">{analytics?.statusBreakdown?.resolved || 0}</h3>
              </div>
            </div>

            {/* Distribution Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Priority Chart */}
              <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl shadow-xl flex flex-col justify-between h-80 backdrop-blur">
                <h3 className="text-md font-bold text-gray-300 tracking-wide">Priority Distribution</h3>
                <div className="flex items-end justify-around h-48 px-4 border-b border-gray-700/60 pb-2">
                  <div className="flex flex-col items-center w-12 group">
                    <div className="text-xs font-extrabold text-red-400 mb-2">{analytics?.priorityBreakdown?.high || 0}</div>
                    <div
                      className="w-full bg-gradient-to-t from-red-600 to-red-400 rounded-t-lg transition-all duration-500 hover:brightness-110 shadow-lg shadow-red-500/10"
                      style={{ height: getBarHeight(analytics?.priorityBreakdown?.high || 0) }}
                    ></div>
                    <span className="text-xs mt-2 text-gray-400 font-semibold">High</span>
                  </div>
                  <div className="flex flex-col items-center w-12 group">
                    <div className="text-xs font-extrabold text-yellow-400 mb-2">{analytics?.priorityBreakdown?.medium || 0}</div>
                    <div
                      className="w-full bg-gradient-to-t from-yellow-600 to-yellow-400 rounded-t-lg transition-all duration-500 hover:brightness-110 shadow-lg shadow-yellow-500/10"
                      style={{ height: getBarHeight(analytics?.priorityBreakdown?.medium || 0) }}
                    ></div>
                    <span className="text-xs mt-2 text-gray-400 font-semibold">Medium</span>
                  </div>
                  <div className="flex flex-col items-center w-12 group">
                    <div className="text-xs font-extrabold text-green-400 mb-2">{analytics?.priorityBreakdown?.low || 0}</div>
                    <div
                      className="w-full bg-gradient-to-t from-green-600 to-green-400 rounded-t-lg transition-all duration-500 hover:brightness-110 shadow-lg shadow-green-500/10"
                      style={{ height: getBarHeight(analytics?.priorityBreakdown?.low || 0) }}
                    ></div>
                    <span className="text-xs mt-2 text-gray-400 font-semibold">Low</span>
                  </div>
                </div>
              </div>

              {/* Status Breakdown Progress Bars */}
              <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl shadow-xl flex flex-col justify-between h-80 backdrop-blur">
                <h3 className="text-md font-bold text-gray-300 tracking-wide">Status Distribution</h3>
                <div className="space-y-4 my-auto">
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-semibold">
                      <span className="text-gray-400">To Do</span>
                      <span className="text-blue-400">{analytics?.statusBreakdown?.todo || 0}</span>
                    </div>
                    <progress
                      className="progress progress-info w-full h-2.5"
                      value={analytics?.statusBreakdown?.todo || 0}
                      max={analytics?.totalTickets || 1}
                    ></progress>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-semibold">
                      <span className="text-gray-400">In Progress</span>
                      <span className="text-warning">{analytics?.statusBreakdown?.inProgress || 0}</span>
                    </div>
                    <progress
                      className="progress progress-warning w-full h-2.5"
                      value={analytics?.statusBreakdown?.inProgress || 0}
                      max={analytics?.totalTickets || 1}
                    ></progress>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-semibold">
                      <span className="text-gray-400">Resolved</span>
                      <span className="text-success">{analytics?.statusBreakdown?.resolved || 0}</span>
                    </div>
                    <progress
                      className="progress progress-success w-full h-2.5"
                      value={analytics?.statusBreakdown?.resolved || 0}
                      max={analytics?.totalTickets || 1}
                    ></progress>
                  </div>
                </div>
              </div>
            </div>

            {/* Moderator Workloads */}
            <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl shadow-xl backdrop-blur">
              <h3 className="text-md font-bold text-gray-300 tracking-wide mb-6">Staff Workload (Active Tickets)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analytics?.workload?.map((staff) => (
                  <div key={staff.email} className="bg-gray-900/40 p-4 rounded-xl border border-gray-800 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-white text-sm truncate max-w-[200px]">{staff.email}</h4>
                        <span className={`badge badge-sm mt-1.5 capitalize font-bold ${staff.role === "admin" ? "badge-primary" : "badge-secondary"}`}>
                          {staff.role}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-primary">{staff.activeTickets}</span>
                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Active</p>
                      </div>
                    </div>
                    <div className="w-full mt-3">
                      <progress
                        className="progress progress-primary w-full h-2"
                        value={staff.activeTickets}
                        max={Math.max(...(analytics?.workload?.map((w) => w.activeTickets) || [1]), 5)}
                      ></progress>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="animate-fade-in">
          <input
            type="text"
            className="input input-bordered w-full mb-6"
            placeholder="Search users by email"
            value={searchQuery}
            onChange={handleSearch}
          />
          {filteredUsers.map((user) => (
            <div
              key={user._id}
              className="bg-base-100 shadow rounded p-4 mb-4 border"
            >
              <p>
                <strong>Email:</strong> {user.email}
              </p>
              <p>
                <strong>Current Role:</strong> {user.role}
              </p>
              <p>
                <strong>Skills:</strong>{" "}
                {user.skills && user.skills.length > 0
                  ? user.skills.join(", ")
                  : "N/A"}
              </p>

              {editingUser === user.email ? (
                <div className="mt-4 space-y-2">
                  <select
                    className="select select-bordered w-full"
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                  >
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Comma-separated skills"
                    className="input input-bordered w-full"
                    value={formData.skills}
                    onChange={(e) =>
                      setFormData({ ...formData, skills: e.target.value })
                    }
                  />

                  <div className="flex gap-2">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={handleUpdate}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingUser(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleEditClick(user)}
                  >
                    Edit
                  </button>
                  {currentUser._id !== user._id && (
                    <button
                      className="btn btn-error btn-outline btn-sm"
                      onClick={() => handleDelete(user._id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
