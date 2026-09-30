"use client";

import { doctorPage, type ScreenResult } from "digits-in-noise";

/**
 * The one page, rendered.
 *
 * Plain type on a white card, the same in light and dark and on paper,
 * because it is going to be printed or shown on a phone in a waiting
 * room. Print hides everything but the page: the rule in globals.css
 * keys on `data-doctor-page`. The page carries its own scope paragraphs
 * from the package, so what it says it is not is tested, not typed
 * here.
 */
export function DoctorPage({ result, rounds, onClose }: { result: ScreenResult; rounds: number; onClose: () => void }) {
  const page = doctorPage(result, { date: new Date().toISOString().slice(0, 10), rounds, device: "a computer, through this website" });
  return (
    <div data-doctor-page className="mt-8 rounded-2xl border border-line bg-white p-6 text-[#111] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#666]">{page.title}</p>
          <h3 className="mt-2 text-2xl font-semibold">{page.headline}</h3>
        </div>
        <div className="flex gap-2 print:hidden">
          <button type="button" className="secondary" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <dl className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {page.facts.map((f) => (
          <div key={f.label} className="flex justify-between gap-4 border-b border-[#e5e5e5] py-1 text-sm">
            <dt className="text-[#666]">{f.label}</dt>
            <dd className="text-right font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>
      {page.refusals.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold">Why it was not scored</p>
          <ul className="mt-2 list-inside list-disc text-sm text-[#333]">
            {page.refusals.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-6 text-sm leading-relaxed text-[#333]">{page.nextStep}</p>
      <div className="mt-6 space-y-2 border-t border-[#e5e5e5] pt-4">
        {page.scope.map((s) => (
          <p key={s.slice(0, 24)} className="text-xs leading-relaxed text-[#555]">
            {s}
          </p>
        ))}
        <p className="text-xs leading-relaxed text-[#555]">Reference: {page.reference}</p>
      </div>
      <div className="mt-8 border-t border-dashed border-[#bbb] pt-4">
        <p className="text-xs font-semibold text-[#666]">For the professional</p>
        <div className="mt-2 h-20" />
      </div>
    </div>
  );
}
