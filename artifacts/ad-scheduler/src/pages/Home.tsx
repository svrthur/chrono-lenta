import React, { useState, useEffect } from "react"
import { AddCampaignDialog } from "@/components/AddCampaignDialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import CampaignsTable from "@/components/CampaignsTable"
import { getApiUrl } from "@/lib/api"

export function Home() {
  const [open, setOpen] = useState(false)
  const [apiStatus, setApiStatus] = useState<{ ok: boolean; status?: number; count?: number; error?: string } | null>(null)

  useEffect(() => {
    let mounted = true
    const url = getApiUrl('/api/campaigns')
    fetch(url)
      .then(async (res) => {
        if (!mounted) return
        if (!res.ok) {
          setApiStatus({ ok: false, status: res.status })
          return
        }
        const data = await res.json().catch(() => null)
        setApiStatus({ ok: true, status: res.status, count: Array.isArray(data) ? data.length : undefined })
      })
      .catch((err) => mounted && setApiStatus({ ok: false, error: String(err) }))
    return () => { mounted = false }
  }, [])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Список рекламных кампаний</h1>
        <div>
          <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Добавить РК
          </Button>
        </div>
      </div>

      <AddCampaignDialog open={open} onOpenChange={setOpen} />

      <div className="mb-4 p-3 rounded bg-muted text-sm">
        <div><strong>API base:</strong> {(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '(empty)'}</div>
        <div>
          <strong>API test:</strong>{' '}
          {apiStatus === null && 'запрос...'}
          {apiStatus && apiStatus.ok && `OK ${apiStatus.status} — ${apiStatus.count ?? 'n/a'} кампаний`}
          {apiStatus && !apiStatus.ok && `Ошибка ${apiStatus.status ?? ''} ${apiStatus.error ?? ''}`}
        </div>
        <div className="text-xs text-muted-foreground">Если здесь не OK — значит фронтенд не достучался до API.</div>
      </div>

      <div>
        <CampaignsTable />
      </div>
    </div>
  )
}
