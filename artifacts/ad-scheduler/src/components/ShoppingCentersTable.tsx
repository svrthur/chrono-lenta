import React, { useEffect, useState } from 'react'

type SC = {
  id: number
  number: string
  address?: string | null
  city: string
  format: 'ГМ' | 'СМ'
}

function normalizeCity(raw: string) {
  if (!raw) return raw
  const s = raw.toLowerCase()
  if (s.includes('моск') || s.includes('мос. обл') || s.includes('москв')) return 'Москва'
  return raw
}

export function ShoppingCentersTable() {
  const [rows, setRows] = useState<SC[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/shopping-centers')
        if (!res.ok) throw new Error('Fetch failed')
        const data = await res.json()
        if (mounted) setRows(data.map((r: any) => ({ ...r, city: normalizeCity(r.city) })))
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div className="overflow-auto bg-card rounded p-4 mt-4">
      <table className="w-full table-auto text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left">Номер ТК</th>
            <th className="p-2 text-left">Тип ТК</th>
            <th className="p-2 text-left">Город</th>
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length === 0 && (
            <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Нет ТК</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.number}</td>
              <td className="p-2">{r.format}</td>
              <td className="p-2">{r.city}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ShoppingCentersTable
