import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Where a completed screen goes.
 *
 * Append only. A hearing screen is a measurement taken on a day, and the
 * interesting question is almost never "what is it now" but "has it
 * changed", so nothing is ever overwritten and no aggregate is stored.
 * Every figure an agent reports is derived from the rows at the moment
 * it is asked.
 *
 * What is kept is deliberately small: a household identifier, a date, a
 * threshold, whether the run was usable, and which reference it was
 * compared against. No audio. No answers. No recording of anything that
 * happened in the room, because none of that exists anywhere in this
 * project to begin with.
 *
 * The reference is stored with the result rather than looked up later.
 * A threshold in decibels means nothing without the material it was
 * measured against, and that material will change when the provisional
 * bands are replaced. A row that does not carry its own reference
 * becomes uninterpretable the day the reference moves.
 */

export interface ScreenRecord {
  household: string;
  takenAt: string;
  srtDb: number | null;
  valid: boolean;
  band: "clear" | "borderline" | "refer" | "unmeasured";
  reference: string;
  /** Where it was taken. Useful context, never used as a measurement. */
  surface: "television" | "web";
  /** True when the audio was not real speech. */
  placeholderAudio: boolean;
}

export interface ScreenStore {
  record(entry: ScreenRecord): Promise<void>;
  history(household: string, limit?: number): Promise<ScreenRecord[]>;
}

/** Local and test store. Same contract, no network. */
export class MemoryStore implements ScreenStore {
  private readonly rows: ScreenRecord[] = [];

  async record(entry: ScreenRecord): Promise<void> {
    this.rows.push(entry);
  }

  async history(household: string, limit = 20): Promise<ScreenRecord[]> {
    return this.rows
      .filter((r) => r.household === household)
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
      .slice(0, limit);
  }
}

/**
 * DynamoDB, partitioned by household and sorted by date.
 *
 * The sort key carries the date first so a query comes back in order
 * without the server sorting anything, and so "the last five" is a
 * limit rather than a scan.
 */
export class DynamoStore implements ScreenStore {
  private readonly client: DynamoDBDocumentClient;

  constructor(
    private readonly table: string,
    region = process.env.AWS_REGION,
  ) {
    // The region is spread rather than passed, because under
    // exactOptionalPropertyTypes an explicit undefined is not the same
    // as an absent key, and the SDK's own credential chain is what
    // should fill it in when nothing here says otherwise.
    this.client = DynamoDBDocumentClient.from(
      new DynamoDBClient(region ? { region } : {}),
    );
  }

  async record(entry: ScreenRecord): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          pk: `HOUSEHOLD#${entry.household}`,
          sk: `SCREEN#${entry.takenAt}#${Math.random().toString(36).slice(2, 8)}`,
          ...entry,
        },
      }),
    );
  }

  async history(household: string, limit = 20): Promise<ScreenRecord[]> {
    const out = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `HOUSEHOLD#${household}` },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (out.Items ?? []) as ScreenRecord[];
  }
}

/**
 * Whether a series of screens is going anywhere.
 *
 * Deliberately conservative, and deliberately not a trend line. Two
 * results a month apart differing by a decibel is the test repeating
 * itself, not a person changing: the measured test-retest spread is
 * 0.748 dB, so anything under about two decibels is noise wearing a
 * hat. Only a change larger than that, in one direction, across results
 * that are actually usable, is worth mentioning to anybody.
 */
export function changeAcross(history: ScreenRecord[]): {
  usable: number;
  changeDb: number | null;
  note: string;
} {
  const usable = history.filter((r) => r.valid && typeof r.srtDb === "number");
  if (usable.length < 2) {
    return {
      usable: usable.length,
      changeDb: null,
      note: "One usable result is a measurement, not a direction. It takes two.",
    };
  }
  // History arrives newest first.
  const newest = usable[0]!.srtDb!;
  const oldest = usable[usable.length - 1]!.srtDb!;
  const changeDb = Number((newest - oldest).toFixed(2));

  if (Math.abs(changeDb) < 2) {
    return {
      usable: usable.length,
      changeDb,
      note:
        "Within the spread this test shows when the same person takes it twice, so it is not a change.",
    };
  }
  return {
    usable: usable.length,
    changeDb,
    note:
      changeDb > 0
        ? "Larger than the test's own repeatability, in the direction of needing more help to follow speech. Worth mentioning to a clinician."
        : "Larger than the test's own repeatability, in the direction of needing less help. Often means the first result was taken somewhere noisy.",
  };
}
