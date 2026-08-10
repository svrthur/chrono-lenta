import React, { useEffect, useState } from 'react'

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

export function CampaignsTable({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/campaigns')
        if (!res.ok) throw new Error('Fetch failed')
        const data = await res.json()
        if (mounted) setRows(data)
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [refreshKey])

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
          {!loading && rows.length === 0 && (
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
