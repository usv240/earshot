import awsLambdaFastify from "@fastify/aws-lambda";
import { buildServer } from "./server";
import { DynamoStore } from "./store";

/**
 * The same server, behind a Lambda function URL.
 *
 * The only difference from running it locally is where completed checks
 * are kept. Locally they are in memory, which is right for development
 * and wrong for a household that took a check in June and wants to know
 * in September whether anything has moved.
 *
 * That history is the reason this is persisted at all. One threshold is
 * a measurement; the question people actually have is whether it is
 * changing, and that question cannot be answered by a number that was
 * thrown away.
 *
 * What is not here is worth as much as what is. No viewing behaviour is
 * uploaded, so there is no table of it, so there is nothing to leak,
 * subpoena, or quietly start using for something else later.
 */

const table = process.env.SCREENS_TABLE;
if (!table) {
  // Loud at cold start rather than at the first write. A server that
  // accepts a result and drops it is worse than one that will not start.
  throw new Error("SCREENS_TABLE is not set, so completed checks would go nowhere.");
}

const { app } = buildServer({ store: new DynamoStore(table) });

export const handler = awsLambdaFastify(app, {
  // The function URL already answers preflight, and two layers answering
  // it is how a browser ends up rejecting a response both layers thought
  // was correct.
  serializeLambdaArguments: false,
});
