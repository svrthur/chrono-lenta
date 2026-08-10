import React from 'react'
import { useQuery } from '@tanstack/react-query'

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
  const { data: rows = [], isLoading, isError } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  })

  if (isError) {
    return <div className="p-4 text-destructive">Ошибка загрузки кампаний</div>
  }

  return (
    <div className="overflow-auto bg-card rounded p-4">
      <table className="w-full table-auto text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left">A. Название</th>
            <th className="p-2 text-left">B. Тип ТК</th>
            <th className="p-2 text-left">C. Длительность</th>
            <th className="p-2 text-left">D. Владелец</th>
            <th className="p-2 text-left">E. Статус</th>
            <th className="p-2 text-left">F. Дата старта</th>
            <th className="p-2 text-left">G. Дата окончания</th>
            <th className="p-2 text-left">H. Примечание</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Нет кампаний</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.name}</td>
              <td className="p-2">{Array.from(new Set((r.shoppingCenters||[]).map(s=>s.format))).join(', ') || '-'}</td>
              <td className="p-2">{r.duration} сек</td>
              <td className="p-2">{r.client}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">{r.startDate}</td>
              <td className="p-2">{r.endDate}</td>
              <td className="p-2">{r.note || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CampaignsTable
