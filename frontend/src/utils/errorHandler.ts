/**
 * Centralized Error Handler Utility
 * Maps all possible error scenarios to user-friendly messages and console logs
 */

import { AxiosError } from 'axios';

export interface ParsedError {
  message: string;
  errorCode: string;
  statusCode: number | null;
  details: string[];
  isNetworkError: boolean;
  isTimeoutError: boolean;
  isServerError: boolean;
  rawError: any;
}

/**
 * Detailed error message mapping for different HTTP status codes and scenarios
 */
const ERROR_MESSAGE_MAP: Record<number, string> = {
  // 4xx Client Errors
  400: 'Bad request. Please check your input and try again.',
  401: 'Invalid credentials. Please check your email/username and password.',
  403: 'Access forbidden. You do not have permission to perform this action.',
  404: 'Resource not found.',
  409: 'Conflict. The resource already exists.',
  422: 'Validation error. Please check your input.',
  429: 'Too many requests. Please wait a moment and try again.',

  // 5xx Server Errors
  500: 'Internal server error. Please try again later.',
  501: 'Not implemented.',
  502: 'Bad gateway. The server is temporarily unavailable.',
  503: 'Service unavailable. Please try again later.',
  504: 'Gateway timeout. The server is taking too long to respond.',
};

const FIELD_LABEL_MAP: Record<string, string> = {
  email: 'Email',
  password: 'Password',
  username: 'Username',
  first_name: 'First Name',
  last_name: 'Last Name',
  password2: 'Confirm Password',
  detail: 'Error',
  non_field_errors: 'Error',
};

/**
 * Get human-readable field label
 */
function getFieldLabel(field: string): string {
  return FIELD_LABEL_MAP[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
}

/**
 * Parse backend error response into readable messages
 */
function parseBackendError(data: any): string[] {
  const messages: string[] = [];

  if (!data) return messages;

  // Handle "detail" field (common in DRF)
  if (data.detail) {
    messages.push(typeof data.detail === 'string' ? data.detail : String(data.detail));
    return messages;
  }

  // Handle field-level errors (DRF validation format)
  for (const [field, fieldErrors] of Object.entries(data)) {
    const label = getFieldLabel(field);

    if (Array.isArray(fieldErrors)) {
      fieldErrors.forEach((error: any) => {
        if (typeof error === 'string') {
          messages.push(`${label}: ${error}`);
        } else if (error.message) {
          messages.push(`${label}: ${error.message}`);
        } else {
          messages.push(`${label}: ${String(error)}`);
        }
      });
    } else if (typeof fieldErrors === 'string') {
      messages.push(`${label}: ${fieldErrors}`);
    } else if (fieldErrors && typeof fieldErrors === 'object' && fieldErrors.message) {
      messages.push(`${label}: ${fieldErrors.message}`);
    } else {
      messages.push(`${label}: ${String(fieldErrors)}`);
    }
  }

  return messages;
}

/**
 * Main error parser function
 */
export function parseError(error: any): ParsedError {
  const parsed: ParsedError = {
    message: 'An error occurred. Please try again.',
    errorCode: 'UNKNOWN_ERROR',
    statusCode: null,
    details: [],
    isNetworkError: false,
    isTimeoutError: false,
    isServerError: false,
    rawError: error,
  };

  // Log full error for debugging
  console.error('[AUTH ERROR]', {
    timestamp: new Date().toISOString(),
    error,
    type: error?.constructor?.name,
    message: error?.message,
    code: error?.code,
    response: error?.response?.data,
    status: error?.response?.status,
  });

  // Handle Axios errors
  if (error?.isAxiosError || error?.response) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status || null;
    const data = axiosError.response?.data as any;

    parsed.statusCode = status;
    parsed.rawError = { status, data, headers: axiosError.response?.headers };

    if (status) {
      // Determine if it's a server error
      if (status >= 500) {
        parsed.isServerError = true;
        parsed.errorCode = `HTTP_${status}`;
        parsed.message = ERROR_MESSAGE_MAP[status] || 'Server error. Please try again later.';
      } else {
        parsed.errorCode = `HTTP_${status}`;
        parsed.message = ERROR_MESSAGE_MAP[status] || 'Request failed. Please check your input.';
      }

      // Special handling for specific status codes
      switch (status) {
        case 401:
          parsed.errorCode = 'INVALID_CREDENTIALS';
          parsed.message = 'Invalid email/username or password. Please try again.';
          break;
        case 400:
          parsed.errorCode = 'VALIDATION_ERROR';
          parsed.message = 'Please check your input and try again.';
          break;
        case 403:
          parsed.errorCode = 'ACCESS_FORBIDDEN';
          parsed.message = 'You do not have permission to perform this action.';
          break;
        case 429:
          parsed.errorCode = 'RATE_LIMITED';
          parsed.message = 'Too many login attempts. Please wait a few minutes and try again.';
          break;
      }

      // Parse backend error details
      parsed.details = parseBackendError(data);
    }

    return parsed;
  }

  // Handle network errors (timeout, connection refused, etc.)
  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    parsed.isTimeoutError = true;
    parsed.isNetworkError = true;
    parsed.errorCode = 'NETWORK_TIMEOUT';
    parsed.message =
      'Request timed out. Please check your internet connection and try again.';
    console.error('[NETWORK TIMEOUT]', {
      timestamp: new Date().toISOString(),
      message: error?.message,
      code: error?.code,
    });
    return parsed;
  }

  // Handle network errors (no internet, server unreachable)
  if (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ERR_NETWORK' ||
    error?.message?.toLowerCase().includes('network') ||
    error?.message?.toLowerCase().includes('connection')
  ) {
    parsed.isNetworkError = true;
    parsed.errorCode = 'NETWORK_ERROR';
    parsed.message = 'Unable to connect to the server. Please check your internet connection.';
    console.error('[NETWORK ERROR]', {
      timestamp: new Date().toISOString(),
      message: error?.message,
      code: error?.code,
    });
    return parsed;
  }

  // Handle request errors with no response
  if (error?.request && !error?.response) {
    parsed.isNetworkError = true;
    parsed.errorCode = 'NO_RESPONSE';
    parsed.message = 'The server did not respond. Please check your connection and try again.';
    console.error('[NO RESPONSE]', {
      timestamp: new Date().toISOString(),
      request: error?.request,
    });
    return parsed;
  }

  // Generic error message
  if (error?.message) {
    parsed.message = error.message;
    parsed.errorCode = error?.code || 'ERROR';
  }

  return parsed;
}

/**
 * Parse multiple errors (for forms with field-level errors)
 */
export function parseErrors(errors: any): string[] {
  if (!errors) return [];

  if (typeof errors === 'string') {
    return [errors];
  }

  if (Array.isArray(errors)) {
    return errors.map((e) => (typeof e === 'string' ? e : String(e)));
  }

  if (typeof errors === 'object') {
    return parseBackendError(errors);
  }

  return [String(errors)];
}

/**
 * Get user-friendly message based on error type
 */
export function getErrorMessage(error: any): string {
  const parsed = parseError(error);
  return parsed.message;
}

/**
 * Determine if error is recoverable (user can retry)
 */
export function isRecoverableError(error: ParsedError): boolean {
  const nonRecoverableCodes = ['INVALID_CREDENTIALS', 'ACCESS_FORBIDDEN', 'VALIDATION_ERROR'];
  return !nonRecoverableCodes.includes(error.errorCode);
}

/**
 * Check if error is related to authentication
 */
export function isAuthError(error: ParsedError): boolean {
  return ['INVALID_CREDENTIALS', 'EXPIRED_TOKEN', 'UNAUTHORIZED'].includes(error.errorCode);
}
