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

const AWS_BUCKET_NAME = 'frontier-packagelock';

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

try {
  const TARGET_ENV = getEnvVariable('TARGET_ENV', 'unknown');
  const APP_NAME = getEnvVariable('APP_NAME', 'unknown');
  const APP_DIR = process.env.BUILD_DIR || process.cwd()

  console.log("Current Working Directory before CD: ", process.cwd());
  console.log("Changing directory to: ", APP_DIR);

  // CD into the project directory
  shelljs.cd(APP_DIR);

  console.log("Current Working Directory after CD: ", process.cwd());

  // Generate a package-lock file
  // ? if it already exists, should we re-generate?
  console.log(`Attempting to generate package-lock.json file for ${APP_NAME} in ${TARGET_ENV}...`);
  shelljs.exec('npm install --package-lock-only')

  // Verify package-lock.json file exists
  if(fs.existsSync('package-lock.json')) {
      console.log('Package lock file exists')
  
      // Upload to S3
      const params = {
          Bucket: AWS_BUCKET_NAME,
          Key: `${TARGET_ENV}/${APP_NAME}/${Date.now()}-package-lock.json`,
          Body: fs.createReadStream('package-lock.json')
      };
      
      const s3 = new AWS.S3();
  
      const result = s3.upload(params, (err, data) => {
          if(err) {
              console.log('Error uploading package-lock.json to S3', err);
          } else {
              console.log('Successfully uploaded package-lock.json to S3', data);
          }
      });
  } else {
      throw new Error('Package lock file does not exist');
  }
} catch(error) {
  console.error('Error uploading package-lock.json to S3', error);
  console.error('Exiting... but not failing the build');
  process.exit(0);
}