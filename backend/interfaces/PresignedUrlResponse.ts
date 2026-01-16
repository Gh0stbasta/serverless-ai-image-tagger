/**
 * PresignedUrlResponse Interface
 * 
 * Architectural Decision: Defining a strict TypeScript interface for the API response
 * ensures type safety and makes the expected response structure explicit for consumers.
 */
export interface PresignedUrlResponse {
    uploadUrl: string;
    key: string;
    expiresIn: number;
}

/**
 * Type Guard for {@link PresignedUrlResponse}
 * @param obj Object to be checked if it conforms to PresignedUrlResponse
 * @returns True if obj is PresignedUrlResponse, false otherwise
 */
export function isPresignedUrlResponse(obj: unknown): obj is PresignedUrlResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        ('uploadUrl' in obj && typeof obj.uploadUrl === 'string') &&
        ('key' in obj && typeof obj.key === 'string') &&
        ('expiresIn' in obj && typeof obj.expiresIn === 'number')
    );
}