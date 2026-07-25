/**
 * Returns a URL for an API path.
 * In development the Vite proxy forwards /api → the API server.
 * In production VITE_API_BASE_URL points at the Render API service.
 */
export function getApiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return `${base}${path}`;
}
