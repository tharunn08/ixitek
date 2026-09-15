import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, useMotionTemplate, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import NetworkBackdrop from "../../components/admin/NetworkBackdrop.jsx";

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from && location.state.from !== "/admin/login" ? location.state.from : "/admin";

  const [form, setForm] = useState({ username: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | submitting | error
  const [errorMessage, setErrorMessage] = useState("");

  // 3D tilt on the card, following the pointer.
  const cardRef = useRef(null);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);
  const glowBackground = useMotionTemplate`radial-gradient(480px circle at ${glowX}% ${glowY}%, rgba(91,155,245,0.18), transparent 70%)`;

  function handlePointerMove(e) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 10);
    rotateX.set((0.5 - py) * 10);
    glowX.set(px * 100);
    glowY.set(py * 100);
  }
  function handlePointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (status === "error") setStatus("idle");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("submitting");
    try {
      await login(form.username, form.password, { remember });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setErrorMessage(err?.message || "Sign-in failed. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-12 sm:px-6">
      {/* Ambient backdrop */}
      <div className="absolute inset-0">
        <NetworkBackdrop />
      </div>
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-brand-600/25 blur-[120px] animate-drift-a" />
      <div className="pointer-events-none absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-accent-cyan/20 blur-[120px] animate-drift-b" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.05]" />

      <Link
        to="/"
        className="focus-ring absolute left-5 top-5 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-ink-200 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white sm:left-8 sm:top-8"
      >
        <Icon name="ArrowLeft" className="h-3.5 w-3.5" />
        Back to website
      </Link>

      <motion.div
        ref={cardRef}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        style={{ rotateX, rotateY, transformPerspective: 1200 }}
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg"
      >
        <motion.div
          aria-hidden="true"
          style={{ background: glowBackground }}
          className="pointer-events-none absolute -inset-px rounded-[32px]"
        />
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-10 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:p-14">
          {/* top hairline gradient */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/70 to-transparent" />

          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
              className="relative mb-6 flex h-20 w-20 items-center justify-center"
            >
              <span className="absolute inset-0 rounded-2xl bg-brand-500/20 blur-md animate-pulse" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <Icon name="Lock" className="h-8 w-8 text-brand-300" />
              </span>
            </motion.div>
            <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Welcome back</h1>
            <p className="mt-3 max-w-sm text-base leading-relaxed text-ink-300">
              Sign in to continue to your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-9 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-username" className="text-xs font-semibold uppercase tracking-wide text-ink-300">
                Username or email
              </label>
              <div className="group relative">
                <Icon
                  name="User"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand-300"
                />
                <input
                  id="admin-username"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="Enter your username or email"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-ink-500 outline-none transition-all duration-200 focus:border-brand-400/60 focus:bg-white/[0.08] focus:shadow-[0_0_0_4px_rgba(91,155,245,0.15)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-password" className="text-xs font-semibold uppercase tracking-wide text-ink-300">
                Password
              </label>
              <div className="group relative">
                <Icon
                  name="Lock"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand-300"
                />
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-11 text-sm text-white placeholder:text-ink-500 outline-none transition-all duration-200 focus:border-brand-400/60 focus:bg-white/[0.08] focus:shadow-[0_0_0_4px_rgba(91,155,245,0.15)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition-colors hover:text-white"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "EyeOff" : "Eye"} className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-400/40"
                />
                Keep me signed in
              </label>
            </div>

            <AnimatePresence>
              {status === "error" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                    x: [0, -8, 8, -6, 6, -3, 3, 0],
                  }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ x: { duration: 0.4 } }}
                  className="flex items-center gap-2 overflow-hidden rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-200"
                >
                  <Icon name="AlertCircle" className="h-4 w-4 shrink-0" />
                  {errorMessage}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={status === "submitting"}
              whileHover={{ scale: status === "submitting" ? 1 : 1.015 }}
              whileTap={{ scale: 0.98 }}
              className="focus-ring group relative mt-2 inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-600 px-6 py-4 text-base font-semibold text-white shadow-[0_10px_30px_-8px_rgba(29,84,201,0.6)] transition-colors duration-200 hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <AnimatePresence mode="wait" initial={false}>
                {status === "submitting" ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative flex items-center gap-2"
                  >
                    <Icon name="Loader2" className="h-4 w-4 animate-spin" />
                    Signing in...
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative flex items-center gap-2"
                  >
                    Sign in
                    <Icon name="ArrowLeft" className="h-4 w-4 rotate-180 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
