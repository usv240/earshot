import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
  App,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { FunctionUrlAuthType, HttpMethod, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

/**
 * Everything Earshot needs to be on the internet.
 *
 * A static site behind CloudFront, a DynamoDB table for completed
 * checks, and one Lambda behind a function URL for the MCP server.
 * There is no database of viewing behaviour here, and that absence is
 * the design rather than an omission: how a household watches television
 * never leaves the television, so there is nothing to store, nothing to
 * leak and nothing to quietly start using for something else later.
 *
 * Two things in here are carried from siblings that learned them
 * painfully, and both are commented where they happen: the CORS
 * ownership on the function URL, and handing the site's own origin to
 * the server rather than writing a domain into the source.
 */
class EarshotStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const site = new Bucket(this, "Site", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    /*
      Next's static export writes directories with an index.html inside.
      CloudFront's default root object only applies to the root, so
      every other path needs the rewrite, or a visitor following a link
      to /#how gets a 403 that looks like a missing page.
    */
    const indexRewrite = new CfFunction(this, "IndexRewrite", {
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    request.uri = uri + '/index.html';
  }
  return request;
}
      `),
    });

    const distribution = new Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          { function: indexRewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html" },
      ],
    });

    new BucketDeployment(this, "SiteDeployment", {
      sources: [Source.asset(path.join(repo, "apps/web/out"))],
      destinationBucket: site,
      distribution,
      distributionPaths: ["/*"],
    });

    const siteUrl = `https://${distribution.distributionDomainName}`;

    /*
      Completed checks. Partitioned by household, sorted by date, append
      only. Nothing is overwritten and no aggregate is stored, because
      the question people have is whether a threshold is changing and
      that cannot be answered by a number that was thrown away.
    */
    const screens = new Table(this, "Screens", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const mcp = new NodejsFunction(this, "McpServer", {
      entry: path.join(repo, "apps/mcp/src/lambda.ts"),
      runtime: Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        SCREENS_TABLE: screens.tableName,
        /*
          The site's own origin, handed in by the stack that knows it.

          A sibling wrote its CloudFront domain into the server's source.
          That works until the distribution is replaced, and then fails
          in the one way nobody tests for: every agent keeps working,
          because agents send no Origin header at all, and only the
          browser panel that exists to demonstrate the integration gets
          a 403.
        */
        EARSHOT_ALLOWED_ORIGINS: siteUrl,
      },
      bundling: {
        format: OutputFormat.ESM,
        minify: false,
        sourceMap: true,
        /*
          @fastify/aws-lambda is CommonJS and calls require() for
          node:crypto. Bundled into an ES module that call has no
          meaning, and the function dies at cold start with "Dynamic
          require of node:crypto is not supported", which names neither
          the package nor the reason.

          Nothing catches this before deployment. The bundle builds, the
          stack deploys, every in-process test passes, and the first
          request gets a 502. It was found by curling the deployed URL,
          which is the only thing that would have found it.
        */
        banner:
          "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
      },
    });
    screens.grantReadWriteData(mcp);

    const url = mcp.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      /*
        CORS lives here and nowhere else.

        If the Fastify app also registers CORS middleware, the response
        carries two Access-Control-Allow-Origin headers and every browser
        rejects it outright even when both values are identical, while
        curl reports a clean 200 throughout. This has now bitten three
        projects in this hackathon. The server guards on the Lambda
        runtime variable so that exactly one layer is responsible in each
        environment.

        MCP-Session-Id has to be exposed or a browser-based MCP client
        cannot read the session the server just opened for it.
      */
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.DELETE],
        allowedHeaders: ["content-type", "mcp-session-id", "mcp-protocol-version"],
        exposedHeaders: ["mcp-session-id"],
      },
    });

    new CfnOutput(this, "SiteUrl", { value: siteUrl });
    new CfnOutput(this, "McpUrl", { value: `${url.url}mcp` });
    new CfnOutput(this, "ScreensTable", { value: screens.tableName });
  }
}

const app = new App();
new EarshotStack(app, "Earshot");
