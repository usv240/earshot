"use client";

import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The navigation, on screen the whole way down.
 *
 * A first-time visitor should be able to jump to the check, the Fire TV
 * steps, or the evidence from anywhere on the page, so the bar sticks.
 * It is translucent over the page rather than a solid band, so it never
 * hides the line of text underneath it.
 *
 * Eight links, a theme toggle and a call to action do not fit on one
 * row below about 1280px, and letting them wrap puts a two-line header
 * on the bar that is in nearly every shot of the demo. So labels never
 * break, the full row appears only where it fits, and below that the
 * links live behind Menu.
 */

const LINKS = [
  { href: "#outcomes", label: "What it says" },
  { href: "#what", label: "What, why, how" },
  { href: "#firetv", label: "Fire TV" },
  { href: "#alexa", label: "Alexa+" },
  { href: "#evidence", label: "Evidence" },
  { href: "#developers", label: "Developers" },
  { href: "#privacy", label: "Privacy" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <a href="#top" className="display-sm text-2xl text-ink">
          Earshot
        </a>
        <nav className="hidden items-center gap-5 xl:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="whitespace-nowrap text-sm text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <a
            href="#test"
            className="whitespace-nowrap rounded-[0.85rem] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-transform hover:-translate-y-px"
          >
            Take the check
          </a>
        </div>
        <button
          type="button"
          className="ghost xl:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-surface px-5 py-4 xl:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm text-muted">
                {l.label}
              </a>
            ))}
            <a href="#test" onClick={() => setOpen(false)} className="text-sm font-semibold text-[var(--accent)]">
              Take the check
            </a>
            <div className="pt-2 md:hidden">
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
