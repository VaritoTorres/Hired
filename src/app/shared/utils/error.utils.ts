/**
 * @file error.utils.ts
 * @description Centralised error normalisation helpers.
 *
 * Converts any thrown value into a predictable string message so
 * components don't need to type-narrow errors themselves.
 */

/**
 * Extracts a human-readable message from any error type.
 * Handles: Error objects, Supabase AuthError, plain strings, unknown.
 */
export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string')  return error;
  if (error instanceof Error)     return error.message;

  // Supabase errors carry a `message` property on plain objects too.
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>)['message'] === 'string'
  ) {
    return (error as Record<string, unknown>)['message'] as string;
  }

  return 'Ha ocurrido un error desconocido.';
}
