import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex max-w-md flex-col items-center text-center">
        <AlertCircle className="mb-4 h-16 w-16 text-red-500" />
        <h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white">404</h1>
        <p className="mb-6 text-lg text-gray-600 dark:text-gray-400">
          Страница не найдена.
        </p>
        <Link href="/" className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          На главную
        </Link>
      </div>
    </div>
  );
}
