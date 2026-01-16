/**
 * ImageMetadata Interface
 * 
 * Represents the structure of image metadata stored in DynamoDB.
 */
export interface ImageMetadata {
  imageId: string;
  s3Url: string;
  labels: Array<Label>;
  timestamp: string;
}

/**
 * Type Guard for {@link ImageMetadata}
 * @param obj Object to be checked if it conforms to ImageMetadata
 * @returns True if obj is ImageMetadata, false otherwise
 */
export function isImageMetadata(obj: unknown): obj is ImageMetadata {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('imageId' in obj && typeof obj.imageId === 'string') &&
    ('s3Url' in obj && typeof obj.s3Url === 'string') &&
    'labels' in obj &&
    Array.isArray(obj.labels) &&
    obj.labels.every(isLabel) &&
    ('timestamp' in obj && typeof obj.timestamp === 'string')
  );
}

/**
 * Type Guard for array of {@link ImageMetadata}
 * @param obj Object to be checked if it is an array of ImageMetadata
 * @returns True if obj is an array of ImageMetadata, false otherwise
 */
export function isImageMetadataArray(obj: unknown): obj is ImageMetadata[] {
  return Array.isArray(obj) && obj.every(isImageMetadata);
}

/**
 * Label Interface
 * 
 * @see {@link ImageMetadata}
 */
export interface Label {
  name: string;
  confidence: number;
}

/**
 * Type Guard for {@link Label}
 * @param obj Object to be checked if it conforms to Label
 * @returns True if obj is Label, false otherwise
 */
export function isLabel(obj: unknown): obj is Label {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('name' in obj && typeof obj.name === 'string') &&
    ('confidence' in obj && typeof obj.confidence === 'number')
  );
}