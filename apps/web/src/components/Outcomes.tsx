import { interpret, type ScreenResult } from "digits-in-noise";

/**
 * The three things the check can say, side by side.
 *
 * Answers the question every visitor has before pressing Start, and the
 * one a judge asks after: what happens if I do badly. The sentences are
 * produced by the same `interpret` the check itself calls, with a
 * threshold in each band, so this panel cannot drift from what a real
 * result would say. If the wording changes, this changes with it.
 *
 * Nothing here is invented for display. There is no fourth, kinder
 * outcome and no harsher one. A run that does not settle gets its own
 * screen, shown in the demo rather than here, because it is a property
 * of the run and not of the person.
 */

const AT = (srtDb: number): ScreenResult => ({
  srtDb,
  answers: [],
  reversals: 8,
  valid: true,
  problems: [],
});

const BANDS = [
  { srtDb: -9, name: "If you hear well" },
  { srtDb: -4.5, name: "If you are near the line" },
  { srtDb: -1, name: "If you struggle" },
] as const;

export function Outcomes() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {BANDS.map(({ srtDb, name }) => {
        const reading = interpret(AT(srtDb));
        return (
          <div
            key={name}
            className={`card min-w-0 p-6 ${
              reading.band === "refer" ? "border-[var(--accent)]" : ""
            }`}
          >
            <p className="eyebrow">{name}</p>
            <p className="display-sm mt-3 text-xl leading-snug text-ink">
              {reading.headline}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{reading.nextStep}</p>
          </div>
        );
      })}
    </div>
  );
}
