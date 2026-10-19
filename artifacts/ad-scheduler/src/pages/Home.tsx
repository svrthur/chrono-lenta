import React, { useState } from "react"
import { AddCampaignDialog } from "@/components/AddCampaignDialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import CampaignsTable from "@/components/CampaignsTable"

export function Home() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background p-6 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Админ: управление рекламными кампаниями</h1>
          <p className="text-sm text-muted-foreground">
            Загрузка новых рекламных кампаний и редактирование текущих размещений
          </p>
        </div>
        <div>
          <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Загрузка данных
          </Button>
        </div>
      </div>

      <AddCampaignDialog open={open} onOpenChange={setOpen} />

      <div>
        <CampaignsTable />
      </div>
    </div>
  )
}

export default Home
