var { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
var { execSync } = require("child_process");
var path = require("path");
var fs = require("fs");

function getEnvVariable(name, fallback) {
  let envVar;
  try {
    envVar =
      process.env[name] ||
      fs.readFileSync(path.join(process.env.ENV_DIR, name), {
        encoding: "utf8",
      });
  } catch (e) {
    envVar = fallback;
  }
  return envVar;
}

const AWS_BUCKET_NAME = "frontier-packagelock";
const BUCKET_ENVS = ["dev", "test", "prod"];
const UNKNOWN_SHA = "unknown-sha";
let COMMIT_SHA_TRIMMED;
let REGION;
let s3;

try {
  REGION = getEnvVariable("AWS_DEFAULT_REGION", "us-east-1");
  const accessKeyId = getEnvVariable("S3_ACCESS_KEY");
  const secretAccessKey = getEnvVariable("S3_SECRET_ACCESS_KEY");

  s3 = new S3Client({
    region: REGION,
    maxAttempts: 10,
    // Only pin credentials when the deploy actually supplied them. Handing the v3 client an
    // undefined accessKeyId is a hard error, whereas omitting the key entirely lets it fall back
    // to the default provider chain the way the v2 client did.
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });

  // frapi's PromoteDeployedDependencies finds a build's lockfile by the first 20 characters of
  // the deploy's commit SHA, so this prefix is a contract with that lambda. Changing the length
  // or the filename shape below breaks promotion silently.
  COMMIT_SHA_TRIMMED = getEnvVariable("BUILD_GIT_CURRENT_SHA", UNKNOWN_SHA).slice(0, 20);
} catch (error) {
  console.error("Dependency Reporter is not configured for this deploy");
  console.error(error);
  console.error("Exiting upload task without error");
  process.exit(0);
}

async function main() {
  // const TARGET_ENV = getEnvVariable("TARGET_ENV", "unknown");
  const APP_NAME = getEnvVariable("APP_NAME", "unknown");
  const APP_DIR = process.env.BUILD_DIR || process.cwd();
  // Upload to S3 depending on build env -- if TARGET_ENV is "beta", upload to "dev" bucket. If TARGET_ENV is "build", upload to "prod" bucket.
  // For now, we're using all three deployed frapi buckets for testing, so we'll set the bucket_env manually in each set of parameters.
  // Revisit later once we're out of the testing phase.
  // const BUCKET_ENV = TARGET_ENV === "beta" ? "dev" : TARGET_ENV === "build" ? "prod" : "prod"; // Default to "prod" bucket.

  if (COMMIT_SHA_TRIMMED === UNKNOWN_SHA) {
    // frapi looks lockfiles up by commit SHA, so anything filed under "unknown-sha" can never be
    // promoted, and since only promoted lockfiles are ingested it will never reach the dashboard.
    // Upload anyway so behavior does not change, but say so loudly.
    console.error(
      `WARNING: BUILD_GIT_CURRENT_SHA is not set for ${APP_NAME}. Uploading under "${UNKNOWN_SHA}", which frapi cannot promote, so this app's dependencies will not appear in the Frontier Dashboard.`
    );
  }

  console.log("Current Working Directory before CD: ", process.cwd());
  console.log("Changing directory to: ", APP_DIR);

  process.chdir(APP_DIR); // CD into the project directory
  console.log("Current Working Directory after CD: ", process.cwd());

  let packageLockGenerated = false;

  if (!fs.existsSync("package-lock.json")) {
    console.log(
      `Attempting to generate package-lock.json file for ${APP_NAME}...`
    );
    execSync("npm install --package-lock-only", { stdio: "inherit" });

    console.log("New package-lock.json file generated.");

    packageLockGenerated = true;
  } else {
    console.log("package-lock.json already exists.");
  }
  console.log(
    `Uploading package-lock.json file to S3 in ${REGION} for ${APP_NAME} to frapi...`
  );

  // One key shared by every bucket. These used to be three hand-maintained parameter objects, and
  // the prod copy drifted onto a Date.now() timestamp -- which frapi could never match against a
  // commit SHA, so no prod lockfile was ever promotable.
  const key = `${APP_NAME}/${COMMIT_SHA_TRIMMED}-package-lock${packageLockGenerated ? '-generated' : ''}.json`;

  // Read once into a buffer so the payload can be reused across multiple uploads. (A single
  // ReadStream can only be consumed once; reusing it across the three uploads would truncate two.)
  const body = fs.readFileSync("package-lock.json");

  // Each upload catches its own error, so nothing rejects and one bad bucket cannot short-circuit
  // the other two.
  await Promise.all(
    BUCKET_ENVS.map(async (env) => {
      const Bucket = `${AWS_BUCKET_NAME}-${env}`;

      try {
        const data = await s3.send(
          new PutObjectCommand({ Bucket, Key: key, Body: body })
        );
        console.log(`Successfully uploaded ${env} package-lock.json file to S3 at ${Bucket}/${key}`);
        console.log({
          ETag: data.ETag,
          ServerSideEncryption: data.ServerSideEncryption,
          Bucket,
          Key: key,
        });
      } catch (err) {
        console.error(`Error uploading ${env} package-lock.json file to S3`);
        console.error(err);
      }
    })
  );
}

main().catch((error) => {
  console.error("Error uploading package-lock.json files to S3");
  console.error(error);
  console.error("Exiting upload task without error");
  process.exit(0);
});
