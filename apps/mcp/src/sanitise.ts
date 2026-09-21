/**
 * Enforce the house style instead of asking for it.
 *
 * The system prompt tells the model to use no dashes as punctuation. The
 * model agrees and then uses them anyway, which is the ordinary outcome
 * of putting a formatting rule in a prompt: it is a preference expressed
 * to a sampler, not a constraint on the output.
 *
 * Found live in a sibling project, whose weekly note rendered "nine
 * features, em dash, including filler rate, em dash, that differ" on the
 * deployed dashboard. The same risk exists anywhere model text reaches a
 * reader, so the same guard goes everywhere it can.
 */
export function sanitiseModelText(text: string): string {
  let out = text;
  // A dash between digits is a range, not an aside. A comma there would
  // turn "3 to 5 days" into "3, 5 days", which means something else.
  out = out.replace(/(?<=\d)\s*[\u2013\u2014]\s*(?=\d)/g, " to ");
  for (const dash of ["\u2014", "\u2013"]) {
    out = out.split(` ${dash} `).join(", ");
    out = out.split(dash).join(", ");
  }
  while (out.includes(", ,")) out = out.split(", ,").join(",");
  out = out.split(" ,").join(",").split(",,").join(",");
  return out.split(/\s+/).join(" ").trim();
}
