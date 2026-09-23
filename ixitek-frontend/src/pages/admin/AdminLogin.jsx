import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, useMotionTemplate, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { isAdminRole } from "../../lib/adminAuth.js";
import NetworkBackdrop from "../../components/admin/NetworkBackdrop.jsx";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const initialSignupForm = { name: "", email: "", phone: "", company: "", password: "", confirmPassword: "" };
const initialSigninForm = { identifier: "", password: "" };

export default function AdminLogin({ initialMode = "signin" }) {
  const { login, register } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectFrom =
    location.state?.from && !["/login", "/signup", "/admin/login"].includes(location.state.from)
      ? location.state.from
      : null;

  const [mode, setMode] = useState(initialMode === "signup" ? "signup" : "signin");
  const [signinForm, setSigninForm] = useState(initialSigninForm);
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | submitting | error
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

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

  function switchMode(next) {
    setMode(next);
    setStatus("idle");
    setErrorMessage("");
    setFieldErrors({});
  }

  function updateSignin(field, value) {
    setSigninForm((f) => ({ ...f, [field]: value }));
    if (status === "error") setStatus("idle");
  }

  function updateSignup(field, value) {
    setSignupForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
    if (status === "error") setStatus("idle");
  }

  function redirectAfterAuth(session) {
    if (isAdminRole(session?.role, session?.permissions)) {
      navigate(redirectFrom || "/admin", { replace: true });
    } else {
      navigate(redirectFrom || "/", { replace: true });
    }
  }

  async function handleSignin(e) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");
    try {
      const session = await login(signinForm.identifier, signinForm.password, { remember });
      redirectAfterAuth(session);
    } catch (err) {
      setErrorMessage(err?.message || "Sign-in failed. Please try again.");
      setStatus("error");
    }
  }

  function validateSignup() {
    const next = {};
    if (!signupForm.name.trim()) next.name = "Enter your name.";
    if (!signupForm.email.trim() || !EMAIL_RE.test(signupForm.email.trim())) next.email = "Enter a valid email address.";
    if (!signupForm.password || signupForm.password.length < 8 || !/[A-Za-z]/.test(signupForm.password) || !/[0-9]/.test(signupForm.password)) next.password = "At least 8 characters, with a letter and a number.";
    if (signupForm.confirmPassword !== signupForm.password) next.confirmPassword = "Passwords don't match.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (!validateSignup()) return;
    setStatus("submitting");
    setErrorMessage("");
    try {
      const session = await register({
        name: signupForm.name.trim(),
        email: signupForm.email.trim(),
        phone: signupForm.phone.trim(),
        company: signupForm.company.trim(),
        password: signupForm.password,
      });
      redirectAfterAuth(session);
    } catch (err) {
      setErrorMessage(err?.message || "Could not create your account. Please try again.");
      setStatus("error");
    }
  }

  const isSignup = mode === "signup";

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
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:p-11">
          {/* top hairline gradient */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/70 to-transparent" />

          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
              className="relative mb-5 flex h-16 w-16 items-center justify-center"
            >
              <span className="absolute inset-0 rounded-2xl bg-brand-500/20 blur-md animate-pulse" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <Icon name={isSignup ? "UserPlus" : "Lock"} className="h-7 w-7 text-brand-300" />
              </span>
            </motion.div>
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
              {isSignup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-300">
              {isSignup
                ? "Sign up to track your enquiries and get faster support."
                : "Sign in to continue to your account."}
            </p>
          </div>

          {/* Sign in / Create account tabs */}
          <div className="mx-auto mt-7 flex w-full max-w-xs rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                !isSignup ? "bg-brand-600 text-white shadow" : "text-ink-300 hover:text-white"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                isSignup ? "bg-brand-600 text-white shadow" : "text-ink-300 hover:text-white"
              }`}
            >
              Create account
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {!isSignup ? (
              <motion.form
                key="signin"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSignin}
                noValidate
                className="mt-7 flex flex-col gap-5"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="signin-identifier" className="text-xs font-semibold uppercase tracking-wide text-ink-300">
                    Email or username
                  </label>
                  <div className="group relative">
                    <Icon
                      name="User"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand-300"
                    />
                    <input
                      id="signin-identifier"
                      autoComplete="username"
                      value={signinForm.identifier}
                      onChange={(e) => updateSignin("identifier", e.target.value)}
                      placeholder="Enter your email or username"
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-ink-500 outline-none transition-all duration-200 focus:border-brand-400/60 focus:bg-white/[0.08] focus:shadow-[0_0_0_4px_rgba(91,155,245,0.15)]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="signin-password" className="text-xs font-semibold uppercase tracking-wide text-ink-300">
                    Password
                  </label>
                  <div className="group relative">
                    <Icon
                      name="Lock"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand-300"
                    />
                    <input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={signinForm.password}
                      onChange={(e) => updateSignin("password", e.target.value)}
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

                <ErrorBanner show={status === "error"} message={errorMessage} />

                <SubmitButton submitting={status === "submitting"} idleLabel="Sign in" busyLabel="Signing in..." />
              </motion.form>
            ) : (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSignup}
                noValidate
                className="mt-7 flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    id="signup-name"
                    icon="User"
                    label="Full name"
                    placeholder="Jordan Patel"
                    value={signupForm.name}
                    onChange={(v) => updateSignup("name", v)}
                    error={fieldErrors.name}
                    autoComplete="name"
                  />
                  <TextField
                    id="signup-phone"
                    icon="Phone"
                    label="Phone (optional)"
                    placeholder="+91 00000 00000"
                    value={signupForm.phone}
                    onChange={(v) => updateSignup("phone", v)}
                    autoComplete="tel"
                  />
                </div>

                <TextField
                  id="signup-email"
                  icon="Mail"
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  value={signupForm.email}
                  onChange={(v) => updateSignup("email", v)}
                  error={fieldErrors.email}
                  autoComplete="email"
                />

                <TextField
                  id="signup-company"
                  icon="Building2"
                  label="Company (optional)"
                  placeholder="Your organization"
                  value={signupForm.company}
                  onChange={(v) => updateSignup("company", v)}
                  autoComplete="organization"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    id="signup-password"
                    icon="Lock"
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters, incl. a number"
                    value={signupForm.password}
                    onChange={(v) => updateSignup("password", v)}
                    error={fieldErrors.password}
                    autoComplete="new-password"
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition-colors hover:text-white"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        <Icon name={showPassword ? "EyeOff" : "Eye"} className="h-4 w-4" />
                      </button>
                    }
                  />
                  <TextField
                    id="signup-confirm"
                    icon="Lock"
                    label="Confirm password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={signupForm.confirmPassword}
                    onChange={(v) => updateSignup("confirmPassword", v)}
                    error={fieldErrors.confirmPassword}
                    autoComplete="new-password"
                  />
                </div>

                <ErrorBanner show={status === "error"} message={errorMessage} />

                <SubmitButton submitting={status === "submitting"} idleLabel="Create account" busyLabel="Creating account..." />

                <p className="text-center text-xs leading-relaxed text-ink-400">
                  By creating an account you agree to be contacted about your enquiries. Staff and
                  admin access is granted separately by the site owner.
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function TextField({ id, icon, label, value, onChange, placeholder, type = "text", error, autoComplete, trailing }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-ink-300">
        {label}
      </label>
      <div className="group relative">
        <Icon
          name={icon}
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand-300"
        />
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!error}
          className={`w-full rounded-xl border bg-white/5 py-3.5 pl-11 ${trailing ? "pr-11" : "pr-4"} text-sm text-white placeholder:text-ink-500 outline-none transition-all duration-200 focus:bg-white/[0.08] focus:shadow-[0_0_0_4px_rgba(91,155,245,0.15)] ${
            error ? "border-red-400/50 focus:border-red-400/60" : "border-white/10 focus:border-brand-400/60"
          }`}
        />
        {trailing}
      </div>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}

function ErrorBanner({ show, message }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto", x: [0, -8, 8, -6, 6, -3, 3, 0] }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ x: { duration: 0.4 } }}
          className="flex items-center gap-2 overflow-hidden rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-200"
        >
          <Icon name="AlertCircle" className="h-4 w-4 shrink-0" />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SubmitButton({ submitting, idleLabel, busyLabel }) {
  return (
    <motion.button
      type="submit"
      disabled={submitting}
      whileHover={{ scale: submitting ? 1 : 1.015 }}
      whileTap={{ scale: 0.98 }}
      className="focus-ring group relative mt-1 inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-600 px-6 py-4 text-base font-semibold text-white shadow-[0_10px_30px_-8px_rgba(29,84,201,0.6)] transition-colors duration-200 hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <AnimatePresence mode="wait" initial={false}>
        {submitting ? (
          <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex items-center gap-2">
            <Icon name="Loader2" className="h-4 w-4 animate-spin" />
            {busyLabel}
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex items-center gap-2">
            {idleLabel}
            <Icon name="ArrowLeft" className="h-4 w-4 rotate-180 transition-transform duration-200 group-hover:translate-x-0.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
