// Header — FS-style information architecture in IXITEK blue:
//   utility bar: ship-to (country / language / currency) · quick order · track order · support · account
//   main bar:    logo · Products (mega menu) · Solutions · Services · Resources · Support · Company · search · RFQ · cart
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import Logo from "../ui/Logo.jsx";
import MegaMenu from "./MegaMenu.jsx";
import WhoWeAreMenu from "./WhoWeAreMenu.jsx";
import MobileNav from "./MobileNav.jsx";
import HeaderSearch from "../catalog/HeaderSearch.jsx";
import LocaleSelector, { DetectionBanner } from "../intl/LocaleSelector.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";

const NAV = [
  { to: "/solutions", key: "solutions", match: ["/solutions"] },
  { to: "/services", key: "services", match: ["/services", "/sap"] },
  { to: "/resources", key: "resources", match: ["/resources"] },
  { to: "/support", key: "support", match: ["/support"] },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { session, isAuthenticated, isAdmin, logout } = useAdminAuth();
  const { count, toast, clearToast } = useCart();
  const { t } = useLocale();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMegaOpen(false);
    setWhoOpen(false);
    setMobileOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  const path = location.pathname;
  const productsActive = ["/products", "/catalog", "/product/", "/compare", "/search"].some((p) => path.startsWith(p));
  const companyActive = ["/company", "/partners", "/career", "/contact"].some((p) => path.startsWith(p));
  const item = (active) =>
    `focus-ring relative flex h-full items-center gap-1 px-1 text-[15px] font-semibold transition-colors ${active ? "text-brand-700" : "text-ink-700 hover:text-brand-700"}`;
  const bar = (active) => <span className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-brand-600 transition-transform ${active ? "scale-x-100" : "scale-x-0"}`} />;

  return (
    <>
      <DetectionBanner />
      {/* Utility bar */}
      <div className="relative z-[60] hidden border-b border-ink-100 bg-ink-50 text-xs text-ink-600 lg:block">
        <div className="container-page flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-ink-500">{t("shipTo")}:</span>
            <LocaleSelector compact={false} className="[&>button]:border-0 [&>button]:bg-transparent [&>button]:px-1 [&>button]:py-0.5 [&>button]:text-xs" />
          </div>
          <nav aria-label="Shortcuts" className="flex items-center gap-4 font-medium">
            <Link to="/quick-order" className="flex items-center gap-1 hover:text-brand-700"><Icon name="ListChecks" className="h-3.5 w-3.5" /> Quick order</Link>
            <Link to="/track-order" className="flex items-center gap-1 hover:text-brand-700"><Icon name="Truck" className="h-3.5 w-3.5" /> Track order</Link>
            <Link to="/support" className="flex items-center gap-1 hover:text-brand-700"><Icon name="LifeBuoy" className="h-3.5 w-3.5" /> Help &amp; support</Link>
            {isAuthenticated ? (
              <div className="relative">
                <button onClick={() => setAccountOpen((v) => !v)} aria-expanded={accountOpen} className="flex items-center gap-1 font-semibold text-ink-800 hover:text-brand-700">
                  <Icon name="User" className="h-3.5 w-3.5" /> {session?.name?.split(" ")[0] || "Account"}
                  <Icon name="ChevronDown" className="h-3 w-3" />
                </button>
                {accountOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-ink-100 bg-white py-1.5 text-sm shadow-elevated">
                    {[["/account", "LayoutDashboard", "My account"], ["/account/orders", "Package", "Orders"], ["/account/quotes", "FileText", "Quotes & RFQs"], ["/account/wishlist", "Heart", "Wishlist"]].map(([to, ic, l]) => (
                      <Link key={to} to={to} className="flex items-center gap-2 px-4 py-2 text-ink-700 hover:bg-ink-50"><Icon name={ic} className="h-4 w-4" /> {l}</Link>
                    ))}
                    {isAdmin && <Link to="/admin" className="flex items-center gap-2 border-t border-ink-100 px-4 py-2 text-ink-700 hover:bg-ink-50"><Icon name="ShieldCheck" className="h-4 w-4" /> Admin</Link>}
                    <button onClick={() => (logout(), setAccountOpen(false), navigate("/"))} className="flex w-full items-center gap-2 border-t border-ink-100 px-4 py-2 text-left text-ink-700 hover:bg-ink-50">
                      <Icon name="LogOut" className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" state={{ from: path }} className="flex items-center gap-1 font-semibold text-ink-800 hover:text-brand-700"><Icon name="User" className="h-3.5 w-3.5" /> Sign in / Register</Link>
            )}
          </nav>
        </div>
      </div>

      <header className={`sticky top-0 z-50 w-full border-b bg-white transition-shadow ${scrolled ? "border-ink-100 shadow-[0_6px_20px_-12px_rgba(15,37,84,0.35)]" : "border-ink-100"}`}>
        <div className="container-page relative flex h-16 items-center gap-4 lg:gap-6">
          <Logo className="shrink-0 origin-left scale-90" />

          <nav aria-label="Main" className="hidden h-full items-stretch gap-5 lg:flex">
            <button
              onMouseEnter={() => (setMegaOpen(true), setWhoOpen(false))}
              onClick={() => setMegaOpen((v) => !v)}
              aria-expanded={megaOpen}
              className={item(productsActive)}
            >
              {t("products")}
              <Icon name="ChevronDown" className={`h-3.5 w-3.5 transition-transform ${megaOpen ? "rotate-180" : ""}`} />
              {bar(productsActive || megaOpen)}
            </button>
            {NAV.map((n) => {
              const active = n.match.some((m) => path.startsWith(m));
              return (
                <NavLink key={n.to} to={n.to} onMouseEnter={() => (setMegaOpen(false), setWhoOpen(false))} className={item(active)}>
                  {t(n.key)}
                  {bar(active)}
                </NavLink>
              );
            })}
            <div className="relative flex" onMouseEnter={() => (setWhoOpen(true), setMegaOpen(false))} onMouseLeave={() => setWhoOpen(false)}>
              <button onClick={() => setWhoOpen((v) => !v)} aria-expanded={whoOpen} className={item(companyActive)}>
                {t("company")}
                <Icon name="ChevronDown" className={`h-3.5 w-3.5 transition-transform ${whoOpen ? "rotate-180" : ""}`} />
                {bar(companyActive)}
              </button>
              <WhoWeAreMenu open={whoOpen} onClose={() => setWhoOpen(false)} />
            </div>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <HeaderSearch className="hidden min-w-0 shrink xl:block xl:w-52 2xl:w-80" />
            <button onClick={() => setSearchOpen((v) => !v)} className="focus-ring rounded-lg p-2 text-ink-700 hover:bg-ink-100 xl:hidden" aria-label="Search products" aria-expanded={searchOpen}>
              <Icon name={searchOpen ? "X" : "Search"} className="h-5 w-5" />
            </button>
            <Link to="/rfq" className="focus-ring hidden items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 md:inline-flex">
              <Icon name="FileText" className="h-4 w-4" /> {t("requestQuote")}
            </Link>
            <Link to={isAuthenticated ? "/account" : "/login"} state={isAuthenticated ? undefined : { from: path }} className="focus-ring rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden" aria-label="Account">
              <Icon name="User" className="h-5 w-5" />
            </Link>
            <Link to="/cart" className="focus-ring relative rounded-lg p-2 text-ink-700 hover:bg-ink-100" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
              <Icon name="ShoppingCart" className="h-5 w-5" />
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{count > 999 ? "999+" : count}</span>}
            </Link>
            <button onClick={() => setMobileOpen(true)} className="focus-ring rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden" aria-label="Open menu">
              <Icon name="Menu" className="h-6 w-6" />
            </button>
          </div>

          <MegaMenu open={megaOpen} onClose={() => setMegaOpen(false)} />
        </div>
        {searchOpen && (
          <div className="container-page pb-3 xl:hidden">
            <HeaderSearch autoFocus onDone={() => setSearchOpen(false)} />
          </div>
        )}
        {toast && (
          <div role="status" className="container-page relative">
            <div className="absolute right-4 top-2 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm shadow-elevated">
              <Icon name="CheckCircle2" className="h-5 w-5 text-emerald-600" />
              <span className="font-semibold text-ink-800">{toast.text}</span>
              <Link to="/cart" onClick={clearToast} className="font-semibold text-brand-700 hover:underline">View cart</Link>
              <button onClick={clearToast} aria-label="Dismiss" className="text-ink-400 hover:text-ink-700"><Icon name="X" className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </header>
      {(megaOpen || whoOpen) && <div className="fixed inset-0 z-30 bg-ink-950/10" onClick={() => (setMegaOpen(false), setWhoOpen(false))} aria-hidden="true" />}
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
