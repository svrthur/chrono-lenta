const PROD_API_URL = "https://chrono-lenta-api.onrender.com"

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`

  // 1. Если задана переменная окружения VITE_API_URL — используем её
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
    return `${envUrl.replace(/\/+$/, "")}${cleanPath}`
  }

  // 2. Если сайт открыт на домене onrender.com — всегда идем напрямую на API-сервер
  if (typeof window !== "undefined" && window.location.hostname.includes("onrender.com")) {
    return `${PROD_API_URL}${cleanPath}`
  }

  // 3. Для локальной разработки
  return cleanPath
}
