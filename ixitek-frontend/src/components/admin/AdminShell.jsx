// AdminShell — sidebar layout for the admin modules (catalog, pricing,
// inventory, audit). Navigation entries appear only for users whose role
// grants the permission; the server enforces the same rules on every call.
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import Logo from "../ui/Logo.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";

const NAV = [
  { section: "Overview", items: [{ to: "/admin", label: "Enquiries & users", icon: "Inbox", perm: "admin.access", end: true }] },
  {
    section: "Sales & orders",
    items: [
      { to: "/admin/orders", label: "Orders", icon: "ShoppingCart", perm: "orders.read" },
      { to: "/admin/rfqs", label: "RFQs", icon: "ClipboardList", perm: "rfq.manage" },
      { to: "/admin/quotes", label: "Quotations", icon: "FileText", perm: "quotes.manage" },
      { to: "/admin/crm", label: "CRM", icon: "Handshake", perm: "crm.manage" },
      { to: "/admin/companies", label: "Companies", icon: "Building2", perm: "users.read" },
    ],
  },
  {
    section: "Fulfilment & service",
    items: [
      { to: "/admin/shipping", label: "Shipping", icon: "Truck", perm: "orders.read" },
      { to: "/admin/returns", label: "Returns", icon: "RotateCcw", perm: "support.manage" },
      { to: "/admin/tickets", label: "Support tickets", icon: "Headset", perm: "support.manage" },
      { to: "/admin/procurement", label: "Procurement", icon: "Factory", perm: "procurement.manage" },
    ],
  },
  { section: "Finance", items: [{ to: "/admin/finance", label: "Payments, invoices & email", icon: "Wallet", perm: ["finance.read", "email.manage"] }] },
  {
    section: "Catalog",
    items: [
      { to: "/admin/catalog/products", label: "Products", icon: "Package", perm: "catalog.read" },
      { to: "/admin/catalog/import", label: "Import catalog", icon: "FileSpreadsheet", perm: "catalog.import" },
      { to: "/admin/catalog/quality", label: "Data quality", icon: "ClipboardCheck", perm: "catalog.read" },
    ],
  },
  {
    section: "Commercial",
    items: [
      { to: "/admin/pricing", label: "Pricing & margins", icon: "Percent", perm: "pricing.read_cost" },
      { to: "/admin/international", label: "International commerce", icon: "Globe2", perm: "intl.read" },
    ],
  },
  {
    section: "Inventory",
    items: [
      { to: "/admin/inventory", label: "Stock levels", icon: "Boxes", perm: "inventory.read", end: true },
      { to: "/admin/inventory/movements", label: "Stock movements", icon: "History", perm: "inventory.read" },
      { to: "/admin/inventory/warehouses", label: "Warehouses", icon: "Warehouse", perm: "inventory.read" },
    ],
  },
  {
    section: "System",
    items: [
      { to: "/admin/monitoring", label: "Monitoring", icon: "Activity", perm: "monitoring.read" },
      { to: "/admin/audit", label: "Audit log", icon: "ScrollText", perm: "audit.read" },
    ],
  },
];

export default function AdminShell() {
  const { session, logout, can } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-5 px-3 py-4">
      {NAV.map((g) => {
        const items = g.items.filter((i) => (Array.isArray(i.perm) ? i.perm.some((p) => can(p)) : can(i.perm)));
        if (!items.length) return null;
        return (
          <div key={g.section}>
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{g.section}</div>
            <ul className="flex flex-col gap-0.5">
              {items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.end}
                    className={({ isActive }) =>
                      `focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"}`
                    }
                  >
                    <Icon name={i.icon} className="h-4 w-4 shrink-0" />
                    {i.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink-50/70">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-ink-100 bg-white px-4">
        <div className="flex items-center gap-3">
          <button className="focus-ring rounded-lg p-1.5 text-ink-600 hover:bg-ink-100 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
            <Icon name="Menu" className="h-5 w-5" />
          </button>
          <Logo className="scale-90" />
          <span className="hidden text-xs font-semibold uppercase tracking-wide text-ink-400 sm:inline">Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="focus-ring hidden items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:text-brand-700 sm:inline-flex">
            <Icon name="ExternalLink" className="h-3.5 w-3.5" /> View site
          </Link>
          <span className="hidden items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-semibold text-ink-700 md:inline-flex">
            <Icon name="User" className="h-3.5 w-3.5" /> {session?.name} · <span className="font-medium text-ink-500">{session?.role?.replace(/_/g, " ")}</span>
          </span>
          <button onClick={logout} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-800">
            <Icon name="LogOut" className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>
      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-ink-100 bg-white lg:block">{nav}</aside>
        {open && (
          <div className="fixed inset-0 top-14 z-30 lg:hidden">
            <div className="absolute inset-0 bg-ink-950/30" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-64 overflow-y-auto bg-white shadow-xl">{nav}</aside>
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-white" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
