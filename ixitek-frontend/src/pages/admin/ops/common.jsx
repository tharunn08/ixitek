// Shared helpers for the admin operations modules (orders, RFQs, quotes,
// finance, shipping, returns, support, CRM, companies, procurement).
import { useCallback, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import { Pill, Modal, Btn, Field, inputCls } from "../../../components/admin/kit/index.jsx";

/** Display a server amount (string) with its currency. Formatting only — never arithmetic. */
export function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 4 }).format(Number(amount));
  } catch {
    return `${currency || ""} ${amount}`.trim();
  }
}
export const Money = ({ amount, currency }) => <span className="tabular-nums">{money(amount, currency)}</span>;

export const label = (s) => (s ? String(s).replace(/_/g, " ") : "—");

const TONES = {
  green: ["paid", "confirmed", "delivered", "captured", "processed", "sent", "accepted", "converted", "received", "completed", "approved", "resolved", "won", "issued", "active"],
  blue: ["processing", "packed", "shipped", "in_transit", "out_for_delivery", "under_review", "quoted", "partially_received", "awaiting_return", "inspected", "open", "proposal", "qualified", "negotiation", "contacted", "draft", "preparing"],
  amber: ["pending_payment", "pending_approval", "unpaid", "submitted", "info_requested", "partially_refunded", "partially_paid", "pending", "pending_customer", "pending_internal", "requested", "new", "queued", "sending", "authorized", "created", "exception", "expired", "superseded", "disputed"],
  red: ["cancelled", "payment_failed", "failed", "rejected", "refunded", "returned", "lost", "void", "suspended", "closed"],
};
export function StatusPill({ status }) {
  const tone = Object.keys(TONES).find((t) => TONES[t].includes(status)) || "gray";
  return <Pill tone={tone}>{label(status)}</Pill>;
}

/** Run an API mutation with busy/error state. Returns [run, busy, error, setError]. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (path, opts = {}, onDone) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(path, { method: "POST", ...opts });
      onDone?.(res);
      return res;
    } catch (err) {
      setError(err?.message || "Request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return [run, busy, error, setError];
}

/** A modal that asks for a reason (and optional extra fields) before a sensitive action. */
export function ReasonModal({ open, title, confirmLabel = "Confirm", danger, onClose, onConfirm, busy, children, minLength = 3 }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={danger ? "danger" : "primary"} disabled={busy || reason.trim().length < minLength} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {children}
        <Field label="Reason (saved in the audit log)">
          <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export const newKey = (prefix = "k") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
export const dateOnly = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "—");
