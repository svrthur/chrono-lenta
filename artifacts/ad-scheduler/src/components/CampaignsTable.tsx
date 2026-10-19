import React, { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import EditCampaignDialog from "./EditCampaignDialog"
import { getApiUrl } from "@/lib/api"
import { FORMAT_OPTIONS } from "./AddCampaignDialog"
import { Button } from "@/components/ui/button"

type Campaign = {
  id: number
  name: string
  client: string
  duration: number
  status: string
  tkType?: string | null
  startDate: string
  endDate: string
  note?: string | null
  shoppingCenters?: { id: number; number: string; city: string; format: string }[]
}

async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch(getApiUrl("/api/campaigns"))
  if (!res.ok) throw new Error("Failed to fetch campaigns")
  return res.json()
}

export function CampaignsTable() {
  const queryClient = useQueryClient()
  const { data: rows = [], isLoading, isError } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  })

  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [editingId, setEditingId] = useState<number | null>(null)

  const [filterType, setFilterType] = useState<string>("")
  const [filterClient, setFilterClient] = useState<string>("")
  const [filterFormat, setFilterFormat] = useState<string>("")

  const toggle = (id: number) => setSelected((s) => ({ ...s, [id]: !s[id] }))
  const selectAll = () => {
    const all: Record<number, boolean> = {}
    rows.forEach((r) => (all[r.id] = true))
    setSelected(all)
  }
  const clearAll = () => setSelected({})

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => Number(k))

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить кампанию? Это действие необратимо.")) return
    try {
      const res = await fetch(getApiUrl(`/api/campaigns/${id}`), { method: "DELETE" })
      if (!res.ok) throw new Error("Удаление не удалось")
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(String(err))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Удалить выбранные кампании (${selectedIds.length} шт.)?`)) return
    try {
      const res = await fetch(getApiUrl("/api/campaigns/bulk-delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) throw new Error("Ошибка массового удаления")
      clearAll()
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(String(err))
    }
  }

  if (isError) {
    return <div className="p-4 text-destructive">Ошибка загрузки кампаний</div>
  }

  const clients = Array.from(new Set(rows.map((r) => r.client))).filter(Boolean)

  const normalizedRows = rows.map((r) => {
    const isPaid =
      r.status === "Платник" ||
      r.status === "платный" ||
      (r.note && r.note.toLowerCase().includes("платн") && !r.note.toLowerCase().includes("не "))
    const typeLabel = isPaid ? "платный" : "не платный"
    const formatLabel =
      r.tkType ||
      (r as any).tk_type ||
      Array.from(new Set((r.shoppingCenters || []).map((s) => s.format))).join(", ") ||
      "—"
    const tkListStr = (r.shoppingCenters || []).map((s) => s.number).join(", ")

    return {
      ...r,
      _typeLabel: typeLabel,
      _formatLabel: formatLabel,
      _tkListStr: tkListStr,
    }
  })

  const filteredRows = normalizedRows
    .filter((r) => (filterType ? r._typeLabel === filterType : true))
    .filter((r) => (filterClient ? r.client === filterClient : true))
    .filter((r) => (filterFormat ? r._formatLabel === filterFormat : true))

  return (
    <div className="overflow-auto bg-card rounded-lg border shadow-sm p-4">
      <EditCampaignDialog
        campaignId={editingId}
        open={!!editingId}
        onOpenChange={(v) => {
          if (!v) setEditingId(null)
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Заказчик</label>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="border rounded px-2.5 py-1.5 text-sm bg-background"
            >
              <option value="">Все заказчики</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Формат</label>
            <select
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
              className="border rounded px-2.5 py-1.5 text-sm bg-background"
            >
              <option value="">Все форматы</option>
              {FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Тип</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border rounded px-2.5 py-1.5 text-sm bg-background"
            >
              <option value="">Все типы</option>
              <option value="платный">платный</option>
              <option value="не платный">не платный</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Выбрано: {selectedIds.length}</span>
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              Удалить выбранные
            </Button>
          )}
          <button className="text-sm underline" onClick={selectAll}>
            Выбрать всё
          </button>
          <button className="text-sm underline" onClick={clearAll}>
            Сбросить
          </button>
        </div>
      </div>

      <table className="w-full table-auto text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2.5 text-left w-8">
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedIds.length === rows.length}
                onChange={(e) => (e.target.checked ? selectAll() : clearAll())}
              />
            </th>
            <th className="p-2.5 text-left">#</th>
            <th className="p-2.5 text-left">Название</th>
            <th className="p-2.5 text-left">Дата старта</th>
            <th className="p-2.5 text-left">Дата окончания</th>
            <th className="p-2.5 text-left">Заказчик</th>
            <th className="p-2.5 text-left">Длительность</th>
            <th className="p-2.5 text-left">Формат</th>
            <th className="p-2.5 text-left">Тип</th>
            <th className="p-2.5 text-left">Список ТК</th>
            <th className="p-2.5 text-left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && filteredRows.length === 0 && (
            <tr>
              <td colSpan={11} className="p-6 text-center text-muted-foreground">
                Нет загруженных рекламных кампаний
              </td>
            </tr>
          )}
          {filteredRows.map((r, idx) => (
            <tr key={r.id} className="border-t hover:bg-muted/20">
              <td className="p-2.5">
                <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} />
              </td>
              <td className="p-2.5 text-muted-foreground">{idx + 1}</td>
              <td className="p-2.5 font-medium">{r.name}</td>
              <td className="p-2.5">{r.startDate}</td>
              <td className="p-2.5">{r.endDate}</td>
              <td className="p-2.5">{r.client}</td>
              <td className="p-2.5">{r.duration} сек</td>
              <td className="p-2.5">{r._formatLabel}</td>
              <td className="p-2.5">{r._typeLabel}</td>
              <td className="p-2.5 max-w-[260px] truncate" title={r._tkListStr}>
                {r._tkListStr || "—"}
              </td>
              <td className="p-2.5">
                <div className="flex gap-3 items-center">
                  <button
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => setEditingId(r.id)}
                  >
                    Редактировать
                  </button>
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => handleDelete(r.id)}
                  >
                    Удалить
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CampaignsTable
