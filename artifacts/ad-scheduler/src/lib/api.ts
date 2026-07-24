/**
 * Returns an absolute URL for an API path.
 * In development the Vite proxy forwards /api → the API server.
 * In production the path is served relative to the same origin.
 */
export function getApiUrl(path: string): string {
  return path
}
