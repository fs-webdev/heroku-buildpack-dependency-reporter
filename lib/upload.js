var AWS = require("aws-sdk");
var path = require("path");
var fs = require("fs");
var _ = require("lodash");
var shelljs = require("shelljs");

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
let COMMIT_SHA_TRIMMED;

try {
  AWS.config.maxRetries = 10;
  AWS.config.accessKeyId = getEnvVariable("S3_ACCESS_KEY");
  AWS.config.secretAccessKey = getEnvVariable("S3_SECRET_ACCESS_KEY");
  AWS.config.region = getEnvVariable("AWS_DEFAULT_REGION", "us-east-1");
  COMMIT_SHA_TRIMMED = getEnvVariable("BUILD_GIT_CURRENT_SHA", "unknown-sha").slice(0, 20);
} catch (error) {
  console.error("Dependency Reporter is not configured for this deploy");
  console.error(error);
  console.error("Exiting upload task without error");
  process.exit(0);
}

try {
  // const TARGET_ENV = getEnvVariable("TARGET_ENV", "unknown");
  const APP_NAME = getEnvVariable("APP_NAME", "unknown");
  const APP_DIR = process.env.BUILD_DIR || process.cwd();
  // Upload to S3 depending on build env -- if TARGET_ENV is "beta", upload to "dev" bucket. If TARGET_ENV is "build", upload to "prod" bucket.
  // For now, we're using all three deployed frapi buckets for testing, so we'll set the bucket_env manually in each set of parameters.
  // Revisit later once we're out of the testing phase.
  // const BUCKET_ENV = TARGET_ENV === "beta" ? "dev" : TARGET_ENV === "build" ? "prod" : "prod"; // Default to "prod" bucket.

  console.log("Current Working Directory before CD: ", process.cwd());
  console.log("Changing directory to: ", APP_DIR);

  shelljs.cd(APP_DIR); // CD into the project directory
  console.log("Current Working Directory after CD: ", process.cwd());

  let packageLockGenerated = false;

  if (!fs.existsSync("package-lock.json")) {
    console.log(
      `Attempting to generate package-lock.json file for ${APP_NAME} in ${BUCKET_ENV}...`
    );
    shelljs.exec("npm install --package-lock-only");

    console.log("New package-lock.json file generated.");

    packageLockGenerated = true;
  } else {
    console.log("package-lock.json already exists.");
  }
  console.log(
    `Uploading package-lock.json file to S3 in ${AWS.config.region} for ${APP_NAME} to frapi...`
  );

  const devParams = {
    Bucket: `${AWS_BUCKET_NAME}-dev`,
    Key: `${APP_NAME}/${COMMIT_SHA_TRIMMED}-package-lock${packageLockGenerated ? '-generated' : ''}.json`,
    Body: fs.createReadStream("package-lock.json"),
  }

  const testParams = {
    Bucket: `${AWS_BUCKET_NAME}-test`,
    Key: `${APP_NAME}/${COMMIT_SHA_TRIMMED}-package-lock${packageLockGenerated ? '-generated' : ''}.json`,
    Body: fs.createReadStream("package-lock.json"),
  }

  const prodParams = {
    Bucket: `${AWS_BUCKET_NAME}-prod`,
    Key: `${APP_NAME}/${Date.now()}-package-lock.json`,
    Body: fs.createReadStream("package-lock.json"),
  };

  const s3 = new AWS.S3();

  s3.upload(devParams, (err, data) => {
    if (err) {
      console.error("Error uploading dev package-lock.json file to S3");
      console.error(err);
    } else {
      console.log("Successfully uploaded dev package-lock.json file to S3");
      console.log(data);
    }
  });

  s3.upload(testParams, (err, data) => {
    if (err) {
      console.error("Error uploading test package-lock.json file to S3");
      console.error(err);
    } else {
      console.log("Successfully uploaded test package-lock.json file to S3");
      console.log(data);
    }
  });

  s3.upload(prodParams, (err, data) => {
    if (err) {
      console.error("Error uploading prod package-lock.json file to S3");
      console.error(err);
    } else {
      console.log("Successfully uploaded prod package-lock.json file to S3");
      console.log(data);
    }
  });
} catch (error) {
  console.error("Error uploading package-lock.json files to S3");
  console.error(error);
  console.error("Exiting upload task without error");
  process.exit(0);
}
