var AWS = require('aws-sdk');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
// var async = require('async');
// var mimeTypes = require('mime-types');
var shelljs = require('shelljs');
// var del = require('del')

function getEnvVariable(name, fallback) {
  let envVar;
  try {
    envVar = process.env[name] || fs.readFileSync(path.join(process.env.ENV_DIR, name), {encoding: 'utf8'});
  } catch(e){
    envVar = fallback;
  }
  return envVar;
}

const AWS_BUCKET_NAME = 'frontier-packagelock-files';

try {

  // AWS.config.logger = process.stdout;
  AWS.config.maxRetries = 10;
  AWS.config.accessKeyId = getEnvVariable('S3_ACCESS_KEY');
  AWS.config.secretAccessKey = getEnvVariable('S3_SECRET_ACCESS_KEY');
  AWS.config.region = getEnvVariable('AWS_DEFAULT_REGION','us-east-1');

    //   frontier-packagelock-files
  // bucket where package-lock files go
//   var AWS_STATIC_BUCKET_NAME = getEnvVariable('S3_BUCKET_NAME');
} catch(error) {
  console.error('Dependency Reporter is not configured for this deploy');
  console.error(error);
  console.error('Exiting without error');
  process.exit(0);
}

// Generate a package-lock file
// ? if it already exists, should we re-generate?
shelljs.exec('npm install --package-lock-only')

// Verify package-lock.json file exists
// prefix name of object with env/appNameFromThePackageLock i.e: dev/frontier-dashboard/timestamp-package-lock.json

if(fs.existsSync('package-lock.json')){
    console.log('Package lock file exists')

    // Upload to S3
    //  s3.upload({
    //     ACL: 'public-read',
    //     Key: key,
    //     Body: fs.createReadStream(file),
    //     Bucket: AWS_STATIC_BUCKET_NAME,
    //     Expires: new Date(yearFromNow),
    //     CacheControl: 'public,max-age=' + yearInMs + ',smax-age=' + yearInMs,
    //     ContentType: contentType
    //   }, () => { })
}