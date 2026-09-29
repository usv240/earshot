# What this uses on AWS, and what it needs to be allowed to do

Two groups. Three services produce the artefacts the product is built
from, each for one job, each replaceable, and they are described first.
Four more serve the deployed demo, as one stack, and they are at the
end. Nothing here is a managed pipeline that has to be stood up before
anything works: the pure parts of this project run and are tested with
no AWS account at all, and these are the steps that produce the two
artefacts an account is needed for.

## Amazon Transcribe: where the words are, never what they were

`npm run analyse` sends a programme's audio to Transcribe and uses the
**timings only**. The transcript is written to disk and read for
`start_time` and `end_time`; the words themselves are never used for
anything, and are never shown, stored in a manifest, or sent anywhere
else.

This is not a small distinction in a project about hearing. The audio
that reaches AWS is the film's soundtrack, not a recording of anybody's
living room, and the thing the recogniser is asked for is a set of
timestamps.

Why it is needed at all: EBU R128 removes silence from a loudness
measurement but not music, so a programme's integrated loudness is
dominated by whatever is loudest in it. A viewer sets the volume for the
dialogue. Transcribe is how the dialogue is located so the loudness can
be measured over it and nowhere else. See `apps/pipeline/src/speech.ts`.

## Amazon S3: because Transcribe reads from a bucket

Only the extracted audio is uploaded, mono at 16 kHz, which is what the
recogniser uses internally. A feature film's soundtrack at that rate is
tens of megabytes against gigabytes of video, and the picture is no
business of a hearing project.

Objects are written under `earshot-analysis/` with a timestamped key.
Nothing reads them back except Transcribe.

## Amazon Polly: the spoken digits

`npm run digits` synthesises the eight digits the test uses, as raw PCM
rather than MP3. A lossy codec would put its own artefacts into the
spectrum, and since the masking noise is shaped to match that spectrum,
the noise would end up masking the encoder as well as the speech.

Each digit is then trimmed, levelled so all eight are equally audible,
and used to build the noise. That work happens locally and is tested;
Polly's job is the voice.

## Permissions

A policy with exactly these actions, and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/earshot-analysis/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "polly:SynthesizeSpeech",
      "Resource": "*"
    }
  ]
}
```

Transcribe also needs to be able to read the object it was pointed at.
If the bucket is in the same account as the caller this works without
anything further.

## Environment

```
AWS_REGION=us-east-1          # or AWS_DEFAULT_REGION
EARSHOT_BUCKET=your-bucket    # or pass --bucket
EARSHOT_VOICE=Joanna          # optional, any Polly neural voice
```

Credentials come from the usual chain. Nothing in this project reads a
key out of a file of its own.

## Running it

```
npm run analyse -- --input film.mkv --id sintel --bucket your-bucket
npm run digits  -- --out apps/web/public/audio
```

`analyse` writes three files per programme into `apps/pipeline/analysis`:
the raw Transcribe output, the speech regions derived from it, and the
analysis itself. All three are kept deliberately. In a sibling project,
having the recogniser's raw output on disk turned an afternoon of
guessing into one look at a file, because the artefact showed the words
had matched perfectly and only the clocks disagreed.

## What it costs

Transcribe is billed by audio minute and is the only part with a cost
that scales with content. A ninety-minute film is ninety minutes of
audio, once, and the result is cached on disk as the analysis file.

Polly runs once for eight short words. Storage is a handful of megabytes
that can be deleted as soon as the transcription job finishes.

## The deployed demo: CloudFront, S3, DynamoDB, Lambda, through CDK

One stack, `infra/bin/app.ts`, deployed with `npm run deploy` from the
repository root. What each part does:

- **Amazon S3 and Amazon CloudFront** serve the website. Next.js
  exports the site as static files, `BucketDeployment` uploads them to
  a private bucket, and a CloudFront distribution is the only thing
  that can read it. The bucket is destroyed with the stack; there is
  nothing in it that is not in the repository.
- **AWS Lambda with a function URL** runs the MCP server, spec revision
  2025-11-25 over Streamable HTTP, on Node 22 with 512 MB and a
  thirty-second timeout. A function URL rather than API Gateway,
  because the endpoint speaks one protocol and needs no stages or
  routes. The stack passes the site's own origin to the function as
  `EARSHOT_ALLOWED_ORIGINS`, which is the whole of the origin
  allowlist: the value is known to the stack and typed nowhere else.
- **Amazon DynamoDB** holds screen results for the agent's history and
  comparison tools: a household name somebody chose, a date, a
  threshold, whether the run settled, and its reference. Nothing that
  identifies a person, and nothing about how anybody watches, which
  never leaves the television. On-demand billing; destroyed with the
  stack.
- **AWS CDK** describes all of the above in TypeScript, and the
  function's esbuild bundle carries a banner that recreates `require`
  for one CommonJS dependency, because the alternative was a 502 at
  runtime rather than an error at synth time.

The demo endpoint has no authentication, which
[SUBMISSION.md](SUBMISSION.md) states as a deliberate scope for a
demonstration. `cdk deploy` needs the usual CloudFormation, S3, Lambda,
DynamoDB, CloudFront and IAM permissions of the account that owns the
stack; the minimum policy above is for producing the artefacts, not
for deploying.

## What happens without an account

Everything that can be checked without one is. The adaptive procedure,
the threshold estimation, the validity rules, the wording, the listening
model, the speech-region arithmetic and all of the signal processing are
pure functions with tests, and `npm test` runs them with no credentials
anywhere.

What an account buys is the two artefacts: a real dialogue loudness
figure for a real programme, and the digit recordings. Both are inputs
to the product rather than parts of it.
