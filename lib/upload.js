var AWS = require("aws-sdk");
var path = require("path");
var fs = require("fs");
var _ = require("lodash");
// var async = require('async');
// var mimeTypes = require('mime-types');
var shelljs = require("shelljs");
// var del = require('del')

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

try {
  AWS.config.maxRetries = 10;
  AWS.config.accessKeyId = getEnvVariable("S3_ACCESS_KEY");
  AWS.config.secretAccessKey = getEnvVariable("S3_SECRET_ACCESS_KEY");
  AWS.config.region = getEnvVariable("AWS_DEFAULT_REGION", "us-east-1");
} catch (error) {
  console.error("Dependency Reporter is not configured for this deploy");
  console.error(error);
  console.error("Exiting upload task without error");
  process.exit(0);
}

try {
  const TARGET_ENV = getEnvVariable("TARGET_ENV", "unknown");
  const APP_NAME = getEnvVariable("APP_NAME", "unknown");
  const APP_DIR = process.env.BUILD_DIR || process.cwd();
  const BUCKET_ENV = TARGET_ENV === "beta" ? "dev" : TARGET_ENV; // Upload to S3 depending on build env -- if TARGET_ENV is beta, upload to dev bucket instead

  console.log("Current Working Directory before CD: ", process.cwd());
  console.log("Changing directory to: ", APP_DIR);

  shelljs.cd(APP_DIR); // CD into the project directory
  console.log("Current Working Directory after CD: ", process.cwd());

  if (!fs.existsSync("package-lock.json")) {
    console.log(
      `Attempting to generate package-lock.json file for ${APP_NAME} in ${BUCKET_ENV}...`
    );
    shelljs.exec("npm install --package-lock-only");

    console.log("New package-lock.json file generated.");
  } else {
    console.log("package-lock.json already exists.");
  }
  console.log(
    `Uploading package-lock.json file to S3 in ${AWS.config.region} for ${APP_NAME} to ${AWS_BUCKET_NAME}-${BUCKET_ENV}...`
  );
  const params = {
    Bucket: `${AWS_BUCKET_NAME}-${BUCKET_ENV}`,
    Key: `${APP_NAME}/${Date.now()}-package-lock.json`,
    Body: fs.createReadStream("package-lock.json"),
  };

  const s3 = new AWS.S3();

  const result = s3.upload(params, (err, data) => {
    if (err) {
      console.error("Error uploading package-lock.json file to S3");
      console.error(err);
    } else {
      console.log("Successfully uploaded package-lock.json file to S3");
      console.log(data);
    }
  });
} catch (error) {
  console.error("Error uploading package-lock.json file to S3");
  console.error(error);
  console.error("Exiting upload task without error");
  process.exit(0);
}
