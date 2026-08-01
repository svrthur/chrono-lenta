import React from "react"
import { Link } from "react-router-dom"

export function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-4">Новая пустая страница для редизайна</h1>
        <p className="mb-4 text-muted-foreground">Отсюда будем поэтапно добавлять компоненты и формы.</p>
        <Link to="/rebuild-admin" className="inline-block px-4 py-2 bg-primary text-white rounded">Открыть админ-форму</Link>
      </div>
    </div>
  )
}
