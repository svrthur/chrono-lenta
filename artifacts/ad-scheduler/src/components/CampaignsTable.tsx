import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import EditCampaignDialog from './EditCampaignDialog'

type Campaign = {
  id: number
  name: string
  client: string
  duration: number
  status: 'Платник' | 'Не платник'
  startDate: string
  endDate: string
  note?: string | null
  shoppingCenters?: { id:number, number:string, city:string, format: string }[]
}

import { getApiUrl } from '@/lib/api'

async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch(getApiUrl('/api/campaigns'))
  if (!res.ok) throw new Error('Failed to fetch campaigns')
  return res.json()
}

export function CampaignsTable() {
  const queryClient = useQueryClient()
  const { data: rows = [], isLoading, isError } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  })

  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [editingId, setEditingId] = useState<number | null>(null)

  const toggle = (id: number) => setSelected((s) => ({ ...s, [id]: !s[id] }))
  const selectAll = () => {
    const all: Record<number, boolean> = {}
    rows.forEach((r) => (all[r.id] = true))
    setSelected(all)
  }
  const clearAll = () => setSelected({})

  const handleDelete = async (id: number) => {
    const ok = window.confirm('Удалить кампанию? Это действие необратимо.')
    if (!ok) return
    try {
      const res = await fetch(getApiUrl(`/api/campaigns/${id}`), { method: 'DELETE' })
      if (!res.ok) throw new Error('Удаление не удалось')
      queryClient.invalidateQueries(['campaigns'])
    } catch (err) {
      window.alert(String(err))
    }
  }

  if (isError) {
    return <div className="p-4 text-destructive">Ошибка загрузки кампаний</div>
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="overflow-auto bg-card rounded p-4">
      <EditCampaignDialog campaignId={editingId} open={!!editingId} onOpenChange={(v)=>{ if(!v) setEditingId(null)}} />
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm">Выбрано: {Object.values(selected).filter(Boolean).length}</div>
        <div className="space-x-2">
          <button className="text-sm underline" onClick={selectAll}>Выбрать всё</button>
          <button className="text-sm underline" onClick={clearAll}>Очистить</button>
        </div>
      </div>

      <table className="w-full table-auto text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left"><input type="checkbox" onChange={(e)=> e.target.checked ? selectAll() : clearAll()} /></th>
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">A. Название</th>
            <th className="p-2 text-left">B. Тип ТК</th>
            <th className="p-2 text-left">C. Длительность</th>
            <th className="p-2 text-left">D. Владелец</th>
            <th className="p-2 text-left">E. Статус</th>
            <th className="p-2 text-left">F. Дата старта</th>
            <th className="p-2 text-left">G. Дата окончания</th>
            <th className="p-2 text-left">H. Примечание</th>
            <th className="p-2 text-left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={11} className="p-4 text-center text-muted-foreground">Нет кампаний</td></tr>
          )}
          {rows.map((r, idx) => {
            // derive schedule status
            const start = r.startDate
            const end = r.endDate
            let sched = 'опубликовано'
            if (start <= today && end >= today) sched = 'Опубликовано'
            else if (end < today) sched = 'завершено'

            const payer = r.status // Платник | Не платник
            const note = [r.note, payer].filter(Boolean).join(' | ')

            return (
              <tr key={r.id} className="border-t">
                <td className="p-2"><input type="checkbox" checked={!!selected[r.id]} onChange={()=>toggle(r.id)} /></td>
                <td className="p-2">{idx + 1}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{Array.from(new Set((r.shoppingCenters||[]).map(s=>s.format))).join(', ') || '-'}</td>
                <td className="p-2">{r.duration} сек</td>
                <td className="p-2">{r.client}</td>
                <td className="p-2">{sched}</td>
                <td className="p-2">{r.startDate}</td>
                <td className="p-2">{r.endDate}</td>
                <td className="p-2">{note}</td>
                <td className="p-2">
                  <div className="flex gap-2 items-center">
                    <button className="text-sm text-blue-600 underline" onClick={()=>setEditingId(r.id)}>Редактировать</button>
                    <button className="text-sm text-red-600 underline" onClick={()=>handleDelete(r.id)}>Удалить</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default CampaignsTable
