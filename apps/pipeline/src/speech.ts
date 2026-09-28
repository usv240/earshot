/**
 * Finding the dialogue, so loudness can be measured over it and nothing
 * else.
 *
 * This is the piece the whole listening model rests on, and the reason
 * it exists is a detail about loudness standards that is easy to miss.
 *
 * EBU R128 already gates out silence: there is an absolute gate at -70
 * LUFS and a relative one ten units below the ungated level, so quiet
 * passages do not drag the figure down. What it does not do is gate out
 * music, or rain, or an explosion. A programme's integrated loudness is
 * therefore dominated by whatever is loudest in it, which for most film
 * and television is not the talking.
 *
 * That matters here more than it would anywhere else. A viewer sets the
 * volume for the dialogue, because the dialogue is the part they are
 * trying to follow. Measure the programme and you measure whatever is
 * loudest in it. Measure the speech and you measure what the person was
 * reaching for.
 *
 * How much difference that makes depends entirely on the programme. On
 * the first real measurement, two minutes of Sintel, it was 0.4 dB,
 * because that clip's non-speech sits at about the same level as its
 * speech. On an action sequence or a concert it would be far more. The
 * point of gating is not that the gap is always large, it is that you
 * cannot know it is small without doing the measurement.
 *
 * Amazon Transcribe already knows where the words are, to the
 * millisecond, because that is what it was asked for. Nothing here asks
 * it what the words were.
 */

export interface TranscribeItem {
  start_time?: string;
  end_time?: string;
  type: "pronunciation" | "punctuation";
}

/** A stretch of time in which somebody is speaking. */
export interface Region {
  start: number;
  end: number;
}

export interface RegionOptions {
  /**
   * Words closer together than this belong to the same stretch.
   *
   * Without merging, a sentence becomes thirty separate regions with
   * gaps at every word boundary, and the loudness measurement then
   * misses the quieter ends of words where consonants live. Consonants
   * are most of what somebody with hearing loss cannot hear, so cutting
   * them out would measure the easiest part of speech and call it
   * dialogue.
   */
  mergeGapSec: number;
  /** Time kept either side of a stretch, for onsets and decays. */
  padSec: number;
  /** Stretches shorter than this are a cough or a mistake. */
  minRegionSec: number;
}

export function defaultRegionOptions(): RegionOptions {
  return { mergeGapSec: 0.35, padSec: 0.08, minRegionSec: 0.25 };
}

/**
 * Word timings to stretches of speech.
 *
 * Punctuation is dropped because Transcribe gives it no time of its own.
 */
export function speechRegions(
  items: TranscribeItem[],
  options: RegionOptions = defaultRegionOptions(),
  duration = Infinity,
): Region[] {
  const words = items
    .filter((i) => i.type === "pronunciation" && i.start_time && i.end_time)
    .map((i) => ({ start: Number(i.start_time), end: Number(i.end_time) }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start);

  const merged: Region[] = [];
  for (const word of words) {
    const last = merged[merged.length - 1];
    if (last && word.start - last.end <= options.mergeGapSec) {
      last.end = Math.max(last.end, word.end);
    } else {
      merged.push({ start: word.start, end: word.end });
    }
  }

  return merged
    .map((r) => ({
      start: Math.max(0, r.start - options.padSec),
      end: Math.min(duration, r.end + options.padSec),
    }))
    // Padding can push two neighbours into each other, and the gate
    // filter sums its terms, so overlapping ranges would count the same
    // audio twice and quietly weight part of the programme.
    //
    // Under the default options this cannot happen, because two regions
    // are merged when the gap is under 0.35s and padding only closes a
    // gap of 0.16s. It is reachable as soon as padSec rises past half
    // of mergeGapSec, which is a configuration somebody will reach for
    // the first time a language with long word-final consonants needs
    // more room.
    .reduce<Region[]>((out, r) => {
      const last = out[out.length - 1];
      if (last && r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        out.push({ ...r });
      }
      return out;
    }, [])
    .filter((r) => r.end - r.start >= options.minRegionSec);
}

/** Seconds of actual speech. */
export function speechSeconds(regions: Region[]): number {
  return regions.reduce((total, r) => total + (r.end - r.start), 0);
}

/** Share of the programme that is somebody talking. */
export function speechShare(regions: Region[], durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  return Math.min(1, speechSeconds(regions) / durationSec);
}

/**
 * The ffmpeg filter that keeps the speech and throws the rest away.
 *
 * `aselect` keeps a frame when the expression is non-zero, so a sum of
 * `between` terms keeps anything inside any region. `asetpts` then
 * restamps what survives so the kept pieces butt up against each other
 * rather than leaving the gaps behind as silence, which would put the
 * silence back into the measurement through the front door.
 *
 * The expression goes in a file rather than on the command line. A
 * ninety-minute film has thousands of regions, and the resulting
 * argument is far past what a shell will carry.
 */
export function gateFilter(regions: Region[]): string {
  if (regions.length === 0) throw new Error("no speech regions to measure");
  const terms = regions
    .map((r) => `between(t,${r.start.toFixed(3)},${r.end.toFixed(3)})`)
    .join("+");
  return `aselect='${terms}',asetpts=N/SR/TB`;
}

/**
 * Integrated loudness, out of what ebur128 prints.
 *
 * Two things guard the same mistake. The pattern is anchored to the
 * start of a line, which excludes the running values ffmpeg prints as
 * it goes, because those sit after a "[Parsed_ebur128...]" prefix and a
 * timestamp. And it takes the last match rather than the first, which
 * matters when a filter graph contains more than one ebur128 and
 * therefore prints more than one summary.
 *
 * Either guard alone would pass the obvious test. Both are here because
 * a running value is a plausible-looking number from partway through
 * the file, and picking one up would silently report the loudness of
 * the first few seconds as the loudness of the programme.
 */
export function parseIntegratedLufs(ffmpegOutput: string): number {
  const matches = [...ffmpegOutput.matchAll(/^\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/gm)];
  const last = matches[matches.length - 1];
  if (!last) throw new Error("ffmpeg printed no integrated loudness");
  return Number(last[1]);
}
