/**
 * @file api-response.model.ts
 * @description Generic typed wrapper for all API responses across the app.
 * Keeps error/loading states co-located with the data they describe.
 */

export interface ApiResponse<T> {
  data:    T | null;
  error:   string | null;
  loading: boolean;
}

/** Factory helper so components get a consistent initial state. */
export function initialApiState<T>(): ApiResponse<T> {
  return { data: null, error: null, loading: false };
}
