"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Light or dark, as a two-state switch rather than a three-way cycle.
 *
 * The previous control cycled system, light, dark, which meant a person
 * who wanted dark had to press it twice and read a label to know where
 * they were. This one shows the state it is in and the state a press
 * would give, and reads the document rather than keeping a second copy
 * in React state: a blocking script in layout.tsx has already applied
 * the stored choice before the first paint, so the attribute on the
 * root element is the truth and useSyncExternalStore reads it.
 */

const KEY = "earshot-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function current(): "light" | "dark" {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, current, () => "light");

  const toggle = useCallback(() => {
    const next = mode === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* Storage unavailable. The choice still holds for this visit. */
    }
  }, [mode]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="ghost inline-flex items-center gap-2"
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      aria-pressed={mode === "dark"}
    >
      <span aria-hidden className="inline-block h-4 w-4">
        {mode === "dark" ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {mode === "dark" ? "Light" : "Dark"}
    </button>
  );
}
