/**
 * Get the DynamoDB table name from environment variables
 * @returns DynamoDB table name
 * @throws Error if the environment variable is not set or not a string
 */
export function getEnvTableName(): string {
  return getEnvStringVar('TABLE_NAME');
}

/**
 * Get the S3 bucket name from environment variables
 * @returns S3 bucket name
 * @throws Error if the environment variable is not set or not a string
 */
export function getEnvBucketName(): string {
  return getEnvStringVar('BUCKET_NAME');
}

/**
 * Get the CloudFront domain from environment variables
 * @returns CloudFront domain
 * @throws Error if the environment variable is not set or not a string
 */
export function getEnvCloudFrontDomain(): string {
  return getEnvStringVar('CLOUDFRONT_DOMAIN');
}

/**
 * Get the maximum number of labels for Rekognition from environment variables
 * @returns Maximum number of labels for Rekognition
 */
export function getEnvRekognitionMaxLabels(defaultValue = 10): number {
  return getEnvIntVar('REKOGNITION_MAX_LABELS', parseInt, defaultValue);
}

/**
 * Get the minimum confidence for Rekognition from environment variables
 * @returns Minimum confidence for Rekognition
 */
export function getEnvRekognitionMinConfidence(defaultValue = 70): number {
  return getEnvIntVar('REKOGNITION_MIN_CONFIDENCE', parseFloat, defaultValue);
}

/**
 * Helper function to retrieve and validate string environment variables
 * @param varName Name of the environment variable
 * @returns Value of the environment variable
 * @throws Error if the environment variable is not set or not a string
 */
function getEnvStringVar(varName: string): string {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`${varName} environment variable is not set`);
  }
  return value;
}

/**
 * Helper function to retrieve and validate integer environment variables
 * @param varName Name of the environment variable
 * @param parser Function to parse the string value to an integer
 * @param defaultValue Optional default value if the environment variable is not set
 * @returns Integer value of the environment variable
 * @throws Error if no default value is provided and the environment variable 
 *          is not set or not a valid integer
 */
function getEnvIntVar(
  varName: string,
  parser: (value: string, radix?: number) => number,
  defaultValue?: number
): number {
  const value = process.env[varName];
  if (!value && defaultValue === undefined) {
    throw new Error(`${varName} environment variable is not set`);
  }
  const intValue = value ? parser(value, 10) : defaultValue!;
  if (isNaN(intValue)) {
    throw new Error(`${varName} environment variable must be a valid integer`);
  }
  return intValue;
}
