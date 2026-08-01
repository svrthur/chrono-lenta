import React, { useState } from "react"
import { AddCampaignDialog } from "@/components/AddCampaignDialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function Home() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative">
      <div className="absolute left-4 top-4">
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить РК
        </Button>
      </div>

      <AddCampaignDialog open={open} onOpenChange={setOpen} />

      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-4">Новая пустая страница для редизайна</h1>
        <p className="mb-4 text-muted-foreground">Отсюда будем поэтапно добавлять компоненты и формы.</p>
        <a href="/rebuild-admin" className="inline-block px-4 py-2 bg-primary text-white rounded">Открыть админ-форму</a>
      </div>
    </div>
  )
}
