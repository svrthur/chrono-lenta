import React, { useState } from "react"
import { AddCampaignDialog, CampaignInitialData } from "@/components/AddCampaignDialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import CampaignsTable from "@/components/CampaignsTable"

export function Home() {
  const [open, setOpen] = useState(false)
  const [duplicateData, setDuplicateData] = useState<CampaignInitialData | null>(null)

  const handleOpenNew = () => {
    setDuplicateData(null)
    setOpen(true)
  }

  const handleDuplicate = (data: CampaignInitialData) => {
    setDuplicateData(data)
    setOpen(true)
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Админ: управление рекламными кампаниями</h1>
          <p className="text-xs text-muted-foreground">
            Загрузка новых рекламных кампаний, копирование и редактирование размещений (удаление только вручную)
          </p>
        </div>
        <div>
          <Button onClick={handleOpenNew} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Загрузка данных
          </Button>
        </div>
      </div>

      <AddCampaignDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setDuplicateData(null)
        }}
        initialData={duplicateData}
      />

      <div>
        <CampaignsTable onDuplicate={handleDuplicate} />
      </div>
    </div>
  )
}

export default Home
