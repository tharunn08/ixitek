import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import Logo from "../../components/ui/Logo.jsx";
import StatCard from "../../components/admin/StatCard.jsx";
import EnquiryDetailDrawer from "../../components/admin/EnquiryDetailDrawer.jsx";
import StaffManager from "../../components/admin/StaffManager.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import {
  getEnquiries,
  subscribeToEnquiries,
  updateEnquiry,
  deleteEnquiry,
} from "../../lib/enquiryStore.js";

const TYPE_TABS = [
  { id: "all", label: "All" },
  { id: "enquiry", label: "Product enquiries" },
  { id: "career", label: "Career applications" },
];

const STATUS_OPTIONS = [
  { id: "all", label: "Any status" },
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "responded", label: "Responded" },
  { id: "archived", label: "Archived" },
];

const STATUS_DOT = {
  new: "bg-brand-500",
  read: "bg-ink-400",
  responded: "bg-emerald-500",
  archived: "bg-amber-500",
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function exportToCsv(records) {
  const headers = ["Type", "Name", "Company", "Email", "Phone", "Category", "Message", "Status", "Submitted"];
  const rows = records.map((r) => [
    r.type,
    r.name,
    r.company || "",
    r.email,
    r.phone || "",
    r.category || "",
    (r.message || "").replace(/\n/g, " "),
    r.status,
    new Date(r.createdAt).toISOString(),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ixitek-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const { session, logout } = useAdminAuth();
  const [records, setRecords] = useState(() => getEnquiries());
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const isOwner = session?.role !== "staff";

  useEffect(() => {
    const unsubscribe = subscribeToEnquiries(setRecords);
    return unsubscribe;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.company, r.email, r.phone, r.category, r.message]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [records, typeFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      total: records.length,
      newCount: records.filter((r) => r.status === "new").length,
      thisWeek: records.filter((r) => r.createdAt >= weekAgo).length,
      careers: records.filter((r) => r.type === "career").length,
    };
  }, [records]);

  function openRecord(record) {
    setSelected(record);
    if (record.status === "new") {
      updateEnquiry(record.id, { status: "read" });
    }
  }

  function handleStatusChange(id, status) {
    const updated = updateEnquiry(id, { status });
    setSelected(updated);
  }

  function handleDelete(id) {
    deleteEnquiry(id);
    setSelected(null);
  }

  return (
    <div className="min-h-screen bg-ink-50/60">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur-md">
        <div className="container-page flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden h-6 w-px bg-ink-200 sm:block" />
            <span className="hidden items-center gap-1.5 text-sm font-semibold text-ink-700 sm:flex">
              <Icon name="LayoutDashboard" className="h-4 w-4 text-brand-600" />
              Enquiry Dashboard
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isOwner && (
              <button
                onClick={() => setTeamOpen(true)}
                className="focus-ring hidden items-center gap-1.5 rounded-full border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 sm:inline-flex"
              >
                <Icon name="Users" className="h-3.5 w-3.5" />
                Team access
              </button>
            )}
            <Link
              to="/"
              className="focus-ring hidden items-center gap-1.5 rounded-full border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 sm:inline-flex"
            >
              <Icon name="ExternalLink" className="h-3.5 w-3.5" />
              View site
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-600 sm:inline-flex">
              <Icon name="User" className="h-3.5 w-3.5" />
              {session?.name || session?.username || "admin"}
            </span>
            <button
              onClick={logout}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-800"
            >
              <Icon name="LogOut" className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container-page py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="font-display text-2xl font-bold text-ink-900">
            Welcome back{session?.name || session?.username ? `, ${session.name || session.username}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Every enquiry and career application submitted from the website lands here automatically.
          </p>
        </motion.div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon="Inbox" label="Total received" value={stats.total} tone="brand" delay={0} />
          <StatCard icon="BellRing" label="Unread / new" value={stats.newCount} tone="amber" delay={0.05} />
          <StatCard icon="TrendingUp" label="This week" value={stats.thisWeek} tone="emerald" delay={0.1} />
          <StatCard icon="Briefcase" label="Career applications" value={stats.careers} tone="ink" delay={0.15} />
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                className={`focus-ring rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  typeFilter === tab.id
                    ? "bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(29,84,201,0.5)]"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
            <div className="relative flex-1 sm:max-w-xs">
              <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, company..."
                className="w-full rounded-full border border-ink-200 bg-white py-2 pl-9 pr-3 text-xs text-ink-700 outline-none transition-colors focus:border-brand-400"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-full border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-600 outline-none focus:border-brand-400"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => exportToCsv(filtered)}
              disabled={!filtered.length}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="Download" className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                <Icon name="Inbox" className="h-6 w-6" />
              </span>
              <h3 className="font-display text-lg font-bold text-ink-800">No enquiries yet</h3>
              <p className="max-w-sm text-sm text-ink-500">
                {records.length === 0
                  ? "New enquiries and career applications submitted from the website will appear here in real time."
                  : "No records match your current filters. Try clearing the search or filters."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              <AnimatePresence initial={false}>
                {filtered.map((record, i) => (
                  <motion.li
                    key={record.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2) }}
                  >
                    <button
                      onClick={() => openRecord(record)}
                      className="focus-ring flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-brand-50/40"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[record.status] || STATUS_DOT.new}`} />
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-600">
                        {record.name?.[0]?.toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink-900">{record.name}</span>
                          <span
                            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline-block ${
                              record.type === "career" ? "bg-ink-100 text-ink-600" : "bg-brand-50 text-brand-700"
                            }`}
                          >
                            {record.type === "career" ? "Career" : "Enquiry"}
                          </span>
                        </div>
                        <p className="truncate text-xs text-ink-500">
                          {record.email} {record.company ? `· ${record.company}` : ""}
                        </p>
                      </div>
                      <p className="hidden max-w-xs flex-1 truncate text-xs text-ink-400 md:block">{record.message}</p>
                      <span className="shrink-0 text-xs text-ink-400">{timeAgo(record.createdAt)}</span>
                      <Icon name="ChevronRight" className="h-4 w-4 shrink-0 text-ink-300" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </main>

      <EnquiryDetailDrawer
        record={selected}
        onClose={() => setSelected(null)}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />

      {isOwner && <StaffManager open={teamOpen} onClose={() => setTeamOpen(false)} />}
    </div>
  );
}
