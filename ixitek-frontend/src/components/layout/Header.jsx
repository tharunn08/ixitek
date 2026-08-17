import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import Logo from "../ui/Logo.jsx";
import MegaMenu from "./MegaMenu.jsx";
import WhoWeAreMenu from "./WhoWeAreMenu.jsx";
import MobileNav from "./MobileNav.jsx";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMegaOpen(false);
    setWhoOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const linkClass = ({ isActive }) =>
    `focus-ring rounded-md px-1 py-1.5 text-sm font-semibold transition-colors ${
      isActive ? "text-brand-600" : "text-ink-700 hover:text-brand-600"
    }`;

  const isWhoActive = location.pathname === "/company" || location.pathname === "/partners";

  return (
    <>
    <header
      className={`sticky z-50 w-full transition-[top] duration-300 ease-out ${scrolled ? "top-3" : "top-0"}`}
    >
      <div
        className={`mx-auto transition-all duration-300 ease-out ${
          scrolled
            ? "max-w-[1240px] rounded-full border border-ink-100 bg-white/95 shadow-[0_16px_40px_-12px_rgba(15,37,84,0.25)] backdrop-blur-md"
            : "max-w-none rounded-none border border-transparent bg-white/75 backdrop-blur-sm"
        }`}
      >
      <div
        className={`container-page relative flex items-center justify-between transition-[height] duration-300 ${
          scrolled ? "h-[60px]" : "h-[76px]"
        }`}
      >
        <Logo className={`origin-left transition-transform duration-300 ${scrolled ? "scale-90" : "scale-100"}`} />

        <nav className="hidden items-center gap-7 lg:flex">
          <div className="group relative flex items-center gap-6">
            <div
              className="relative"
              onMouseEnter={() => {
                setWhoOpen(true);
                setMegaOpen(false);
              }}
              onMouseLeave={() => setWhoOpen(false)}
            >
              <button
                onClick={() => setWhoOpen((v) => !v)}
                className={`focus-ring flex items-center gap-1 rounded-md px-1 py-1.5 text-sm font-semibold transition-colors ${
                  isWhoActive ? "text-brand-600" : "text-ink-700 hover:text-brand-600"
                }`}
              >
                Who We Are
                <Icon name="ChevronDown" className={`h-3.5 w-3.5 transition-transform ${whoOpen ? "rotate-180" : ""}`} />
              </button>
              <WhoWeAreMenu open={whoOpen} onClose={() => setWhoOpen(false)} />
            </div>
            <button
              onMouseEnter={() => {
                setMegaOpen(true);
                setWhoOpen(false);
              }}
              onClick={() => setMegaOpen((v) => !v)}
              className={`focus-ring flex items-center gap-1 rounded-md px-1 py-1.5 text-sm font-semibold transition-colors ${
                location.pathname.startsWith("/products") ? "text-brand-600" : "text-ink-700 hover:text-brand-600"
              }`}
            >
              Products &amp; Solutions
              <Icon name="ChevronDown" className={`h-3.5 w-3.5 transition-transform ${megaOpen ? "rotate-180" : ""}`} />
            </button>
            <NavLink to="/career" className={linkClass}>
              Career
            </NavLink>
            <NavLink to="/contact" className={linkClass}>
              Contact Us
            </NavLink>
          </div>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            to="/contact"
            className="focus-ring hidden items-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-700 sm:inline-flex"
          >
            Get a Quote
            <Icon name="ArrowRight" className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setMobileOpen(true)}
            className="focus-ring rounded-md p-2.5 text-ink-700 hover:bg-ink-100 lg:hidden"
            aria-label="Open menu"
          >
            <Icon name="Menu" className="h-7 w-7" />
          </button>
        </div>

        <MegaMenu open={megaOpen} onClose={() => setMegaOpen(false)} />
      </div>
      </div>
    </header>
    {(megaOpen || whoOpen) && (
      <div
        className="fixed inset-0 z-30 bg-ink-950/10"
        onClick={() => {
          setMegaOpen(false);
          setWhoOpen(false);
        }}
        aria-hidden="true"
      />
    )}
    <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
