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

  // filters & sorting
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterOwner, setFilterOwner] = useState<string>('')
  const [filterTkType, setFilterTkType] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')

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

  // owners and tkTypes for filter selects
  const owners = Array.from(new Set(rows.map(r=>r.client))).filter(Boolean)
  const tkTypes = Array.from(new Set(rows.map(r=> (r.tkType || (r as any).tk_type || Array.from(new Set((r.shoppingCenters||[]).map(s=>s.format))).join(', '))))).filter(Boolean)

  // compute derived status for filtering/sorting
  const computeSchedule = (r: any) => {
    const start = r.startDate
    const end = r.endDate
    const statusVal = (r.status || '').toLowerCase()
    if (['запланировано','опубликовано','завершено'].includes(statusVal)) return r.status
    if (start <= today && end >= today) return 'Опубликовано'
    if (end < today) return 'завершено'
    return 'запланировано'
  }

  const filteredRows = rows
    .map(r => ({...r, _sched: computeSchedule(r), _tk: (r.tkType || (r as any).tk_type || Array.from(new Set((r.shoppingCenters||[]).map(s=>s.format))).join(', ')) }))
    .filter(r => (filterStatus ? r._sched.toLowerCase() === filterStatus.toLowerCase() : true))
    .filter(r => (filterOwner ? r.client === filterOwner : true))
    .filter(r => (filterTkType ? r._tk === filterTkType : true))

  const sortedRows = [...filteredRows]
  if (sortBy) {
    sortedRows.sort((a,b)=>{
      const av = (a as any)[sortBy] || ''
      const bv = (b as any)[sortBy] || ''
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

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

      <div className="flex gap-3 items-center mb-4">
        <div>
          <label className="text-xs block mb-1">Статус</label>
          <select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Все</option>
            <option value="запланировано">запланировано</option>
            <option value="опубликовано">опубликовано</option>
            <option value="завершено">завершено</option>
          </select>
        </div>
        <div>
          <label className="text-xs block mb-1">Владелец</label>
          <select value={filterOwner} onChange={(e)=>setFilterOwner(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Все</option>
            {owners.map(o=> <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs block mb-1">Тип ТК</label>
          <select value={filterTkType} onChange={(e)=>setFilterTkType(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Все</option>
            {['ГМ','СМ','ГМ+СМ'].map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs block mb-1">Сортировать</label>
          <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">По умолчанию</option>
            <option value="_sched">Статус</option>
            <option value="client">Владелец</option>
            <option value="_tk">Тип ТК</option>
          </select>
        </div>
        <div>
          <label className="text-xs block mb-1">Направление</label>
          <button className="border rounded px-2 py-1 text-sm" onClick={()=>setSortDir(s=> s==='asc'?'desc':'asc')}>{sortDir}</button>
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
          {sortedRows.map((r: any, idx) => {
            const payer = (r.note && (r.note.includes('Платник') ? 'Платник' : (r.note.includes('Не платник') ? 'Не платник' : undefined))) || (r.status === 'Платник' || r.status === 'Не платник' ? r.status : undefined)
            const noteParts: string[] = []
            if (r.note) noteParts.push(r.note)
            if (payer && !(r.note && r.note.includes(payer))) noteParts.push(payer)
            const note = noteParts.join(' | ')

            return (
              <tr key={r.id} className="border-t">
                <td className="p-2"><input type="checkbox" checked={!!selected[r.id]} onChange={()=>toggle(r.id)} /></td>
                <td className="p-2">{idx + 1}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r._tk || '-'}</td>
                <td className="p-2">{r.duration} сек</td>
                <td className="p-2">{r.client}</td>
                <td className="p-2">{r._sched}</td>
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
