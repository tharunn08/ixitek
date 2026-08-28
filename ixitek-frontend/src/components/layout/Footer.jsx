import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import Logo from "../ui/Logo.jsx";
import { footerLinks } from "../../data/navigation.js";
import { company } from "../../data/company.js";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="container-page grid grid-cols-1 gap-12 py-16 lg:grid-cols-[1.2fr_0.85fr_0.85fr_1.5fr]">
        <div className="flex flex-col gap-5">
          <Logo light />
          <p className="max-w-xs text-sm leading-relaxed text-ink-300">
            {company.shortDescription}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <a
              href={company.linkedin}
              target="_blank"
              rel="noreferrer"
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-ink-300 transition-colors hover:border-brand-400 hover:text-white"
              aria-label="LinkedIn"
            >
              <Icon name="Linkedin" className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-400">
            Company
          </span>
          {footerLinks.company.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="focus-ring w-fit text-sm text-ink-300 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-400">
            Solutions
          </span>
          {footerLinks.solutions.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="focus-ring w-fit text-sm text-ink-300 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-400">
            Our Offices
          </span>

          <a
            href={`mailto:${company.email}`}
            className="focus-ring flex items-center gap-2.5 text-sm text-ink-300 hover:text-white"
          >
            <Icon name="Mail" className="h-4 w-4 text-brand-400" />
            {company.email}
          </a>

          {company.offices.map((office) => (
            <div
              key={office.id}
              className="flex items-start gap-2.5 text-sm text-ink-300"
            >
              <Icon
                name="MapPin"
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-400"
              />
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wide text-ink-200">
                  {office.label}
                </span>
                {office.address}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="container-page flex flex-col items-center justify-between gap-5 py-6 text-xs text-ink-500 sm:flex-row">
          <div className="flex flex-col gap-2">
            <span>
              &copy; {year} {company.legalNameIN}. All rights reserved.
            </span>
            <span>
              D-U-N-S&reg; {company.duns} &middot; Bangalore, IN &amp; Sacramento, US
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 bg-white">
        <div className="container-page flex items-center justify-center py-4">
          <iframe
            id="Iframe1"
            src="https://dunsregistered.dnb.com/SealAuthentication.aspx?Cid=1"
            width="114"
            height="97"
            frameBorder="0"
            scrolling="no"
            allowTransparency="true"
            title="Dun & Bradstreet Registered Business Seal"
          />
        </div>
      </div>
    </footer>
  );
}
