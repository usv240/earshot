import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";
import {
  durationSec,
  extractAudio,
  ffmpegMeasure,
  requireRegion,
  sleep,
} from "./aws.js";
import {
  defaultRegionOptions,
  gateFilter,
  parseIntegratedLufs,
  speechRegions,
  speechSeconds,
  speechShare,
  type TranscribeItem,
} from "./speech.js";

/**
 * How loud is the dialogue in this programme.
 *
 * One number comes out of here and the whole listening model depends on
 * it being the right one. The answer is not the programme's loudness,
 * which is mostly music and effects. It is the loudness of the talking,
 * because that is what a viewer is setting the volume for.
 *
 * Amazon Transcribe says where the words are. Nothing asks it what they
 * were, and the transcript is written to disk and then used only for its
 * timings. That is worth saying out loud in a project about hearing:
 * there is no transcript of your living room here, because the audio
 * that goes to AWS is the film's, not yours.
 *
 * Every intermediate is kept. In a sibling project, having saved the
 * recogniser's raw output turned a whole afternoon of guessing into one
 * look at a file, because the artefact showed that the words had matched
 * perfectly and only the clocks disagreed. It cost nothing and it has
 * paid for itself more than once.
 *
 *   npm run analyse -- --input film.mkv --id sintel --bucket my-bucket
 */

interface Args {
  input: string;
  id: string;
  bucket: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const input = get("--input");
  const id = get("--id");
  const bucket = get("--bucket") ?? process.env.EARSHOT_BUCKET;
  if (!input || !id || !bucket) {
    throw new Error(
      "Usage: npm run analyse -- --input <file> --id <name> --bucket <s3 bucket>\n" +
        "The bucket can also come from EARSHOT_BUCKET.",
    );
  }
  // Anchored to the repository, not to whatever directory npm ran the
  // workspace script from. The sibling scripts were fixed for this and
  // this one was missed, so the first real run wrote its artefacts to
  // apps/pipeline/apps/pipeline/analysis.
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  return {
    input,
    id,
    bucket,
    out: get("--out") ?? path.join(repo, "apps/pipeline/analysis"),
  };
}

async function transcribeTimings(
  args: Args,
  audioPath: string,
  region: string,
): Promise<TranscribeItem[]> {
  /*
    A transcript already on disk is used rather than bought again.

    Recognition is the only part of this pipeline with a cost that
    scales with content, and the timings for a given programme do not
    change. This also means a failure later in the run, which is how
    this function first got exercised, does not cost a second job.
  */
  const cached = path.join(args.out, `${args.id}.transcribe.json`);
  if (fs.existsSync(cached)) {
    process.stdout.write(`reusing the saved transcript at ${path.basename(cached)}
`);
    return JSON.parse(fs.readFileSync(cached, "utf8")) as TranscribeItem[];
  }

  const s3 = new S3Client({ region });
  const key = `earshot-analysis/${args.id}-${Date.now()}.wav`;

  process.stdout.write(`uploading audio to s3://${args.bucket}/${key} ... `);
  await s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: key,
      Body: fs.readFileSync(audioPath),
      ContentType: "audio/wav",
    }),
  );
  process.stdout.write("done\n");

  const transcribe = new TranscribeClient({ region });
  const jobName = `earshot-${args.id}-${Date.now()}`;
  await transcribe.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: "en-US",
      MediaFormat: "wav",
      Media: { MediaFileUri: `s3://${args.bucket}/${key}` },
    }),
  );

  process.stdout.write(`transcription job ${jobName}`);
  for (let attempt = 0; ; attempt++) {
    await sleep(Math.min(15_000, 3000 + attempt * 1000));
    const { TranscriptionJob: job } = await transcribe.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
    );
    const status = job?.TranscriptionJobStatus;
    process.stdout.write(".");
    if (status === "COMPLETED") {
      process.stdout.write(" completed\n");
      const uri = job?.Transcript?.TranscriptFileUri;
      if (!uri) throw new Error("Transcribe reported success with no transcript to fetch.");
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Could not fetch the transcript: HTTP ${response.status}`);
      }
      const body = (await response.json()) as { results?: { items?: TranscribeItem[] } };
      const items = body.results?.items;
      if (!items?.length) throw new Error("The transcript contained no items.");
      return items;
    }
    if (status === "FAILED") {
      throw new Error(`Transcribe failed: ${job?.FailureReason ?? "no reason given"}`);
    }
  }
}

/** Integrated loudness of a file, over whatever the filter left. */
function measureLufs(audioPath: string, filter: string | null, tmpDir: string): number {
  const args = ["-nostats", "-i", audioPath];
  if (filter) {
    // A ninety-minute film has thousands of regions and the expression
    // runs to hundreds of kilobytes, which is far past what any shell
    // will carry as one argument.
    const scriptPath = path.join(tmpDir, "gate.filter");
    fs.writeFileSync(scriptPath, `${filter},ebur128=peak=none`, "utf8");
    /*
      `-/filter:a file` rather than `-filter_script:a file`.

      The latter was removed in ffmpeg 7 in favour of the generic
      "read this option's value from a file" syntax, and the error it
      gives is "Unrecognized option", which reads like a typo rather
      than a removal. This code had never been run against a real
      programme until today; every test that exercises the filter
      builds the string and never hands it to ffmpeg.
    */
    args.push("-/filter:a", scriptPath);
  } else {
    args.push("-af", "ebur128=peak=none");
  }
  args.push("-f", "null", "-");
  return parseIntegratedLufs(ffmpegMeasure(args));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const region = requireRegion();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "earshot-"));
  const audioPath = path.join(tmpDir, `${args.id}.wav`);
  fs.mkdirSync(args.out, { recursive: true });

  const duration = durationSec(args.input);
  process.stdout.write(`${args.id}: ${duration.toFixed(1)}s of programme\n`);

  /*
    Two extractions doing two different jobs, and separating them took
    three attempts against a real film.

    The centre channel goes to the recogniser. In a surround mix the
    dialogue is a channel rather than a blend, so the centre is the
    cleanest possible input for finding where the words are: speech
    without the score sitting on top of it.

    Every loudness figure, though, is measured on the delivered mix,
    because that is what a television plays and what a viewer sets the
    volume against. Measuring dialogue on the isolated centre channel
    answers a question nobody asked: the viewer never hears that signal
    alone.

    So the gate is the only difference between the two numbers below,
    which is what makes their difference mean anything.
  */
  extractAudio(args.input, audioPath, "dialogue");
  const programmePath = path.join(tmpDir, `${args.id}-programme.wav`);
  extractAudio(args.input, programmePath, "programme");

  const items = await transcribeTimings(args, audioPath, region);
  fs.writeFileSync(
    path.join(args.out, `${args.id}.transcribe.json`),
    JSON.stringify(items, null, 2),
    "utf8",
  );

  const regions = speechRegions(items, defaultRegionOptions(), duration);
  if (regions.length === 0) {
    throw new Error(
      "No speech found. This programme cannot contribute to a listening " +
        "measurement, and pretending otherwise would put a number about " +
        "music into a model about dialogue.",
    );
  }
  fs.writeFileSync(
    path.join(args.out, `${args.id}.regions.json`),
    JSON.stringify(regions),
    "utf8",
  );

  const dialogueLufs = measureLufs(programmePath, gateFilter(regions), tmpDir);
  const programmeLufs = measureLufs(programmePath, null, tmpDir);

  const analysis = {
    id: args.id,
    durationSec: Number(duration.toFixed(2)),
    speechSeconds: Number(speechSeconds(regions).toFixed(2)),
    speechShare: Number(speechShare(regions, duration).toFixed(4)),
    regions: regions.length,
    dialogueLufs,
    programmeLufs,
    /*
      The reason the gating exists, as a number.

      How much the gate changed the answer. Both figures come from the
      same delivered mix, so this is the gate's effect and nothing else.

      An earlier version of this comment asserted that on drama and film
      it is "usually several decibels". The first real measurement, on
      two minutes of Sintel, came back at 0.4 dB, and there was no
      evidence for the claim in the first place. What is true: the gate
      matters when a programme's non-speech is much louder than its
      speech, which is an action sequence or a concert and is not every
      programme, and you cannot know which you have without measuring.
      It costs one extra pass and removes a risk.
    */
    /*
      Both figures come from the same delivered mix, so the gate is the
      only thing that differs between them and the difference is the
      gate's effect rather than an artefact of how the audio was
      prepared. An earlier version measured one on the centre channel
      and the other on a downmix, and reported ten decibels that were
      mostly the downmix.
    */
    gatingDifferenceDb: Number((dialogueLufs - programmeLufs).toFixed(2)),
    measuredAt: new Date().toISOString().slice(0, 10),
  };

  const outPath = path.join(args.out, `${args.id}.analysis.json`);
  fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2) + "\n", "utf8");

  process.stdout.write(
    `dialogue ${dialogueLufs} LUFS, programme ${programmeLufs} LUFS, ` +
      `difference ${analysis.gatingDifferenceDb} dB\n` +
      `${analysis.speechSeconds}s of speech in ${analysis.regions} stretches ` +
      `(${(analysis.speechShare * 100).toFixed(1)}% of the programme)\n` +
      `written to ${outPath}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
