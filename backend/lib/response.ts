import { APIGatewayProxyResultV2 } from "aws-lambda";

/**
 * CORS Headers
 * 
 * Architectural Decision: Allow cross-origin requests from any origin (*).
 * This is acceptable for a public read-only API endpoint.
 * 
 * For production, consider restricting to specific origins:
 * 'Access-Control-Allow-Origin': 'https://yourdomain.com'
 */
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
};

export type ErrorStatusCode = 400 | 500;
const ERROR_STATUS_CODE_MESSAGE_MAP: Record<ErrorStatusCode, string> = {
    400: 'Bad request',
    500: 'Internal server error',
};

/**
 * Create a standardized error response
 * Logs the error message and optional error object to console
 * @param statusCode HTTP status code for the error
 * @param message Detailed error message; can be string or Error object
 * @param error Optional error object for raw logging
 * @returns Standardized error response object
 */
export function createErrorResponse(
    statusCode: ErrorStatusCode,
    message: string | Error | unknown,
    error?: unknown
): APIGatewayProxyResultV2 {
    const _message = message instanceof Error ? message.message : String(message);
    if (error)
        console.error(`${_message}:`, error);
    else
        console.error(`${_message}`);
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
        },
        body: JSON.stringify({ error: ERROR_STATUS_CODE_MESSAGE_MAP[statusCode], message: _message }),
    };
}

/**
 * Create a standardized success response
 * If no data is provided, returns 204 No Content else 200 OK with data
 * @param data Optional data to include in the response body as JSON
 * @returns Standardized success response object
 */
export function createSuccessResponse(
    data?: unknown
): APIGatewayProxyResultV2 {
    const hasBody = data !== undefined;
    return {
        statusCode: hasBody ? 200 : 204,
        headers: {
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...CORS_HEADERS,
        },
        body: hasBody ? JSON.stringify(data) : undefined,
    };
}
