import React, { useState } from "react";
import CampaignsTable from "@/components/CampaignsTable"
import { useQueryClient } from '@tanstack/react-query'
import { getApiUrl } from '@/lib/api'

export function RebuildAdmin() {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tkList, setTkList] = useState("");
  const [status, setStatus] = useState("Платник");
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      client,
      startDate,
      endDate,
      status,
      duration,
      shoppingCenterNumbers: tkList.split(/[,\s]+/).filter(Boolean),
      note: note || undefined,
    };

    const queryClient = useQueryClient()
    try {
      const res = await fetch(getApiUrl(`/api/campaigns`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Ошибка: ${data.error || res.statusText}`);
      } else {
        setResult("Кампания создана");
        setName(""); setClient(""); setStartDate(""); setEndDate(""); setTkList(""); setNote("");
        // Invalidate campaigns query so table refreshes
        try { queryClient.invalidateQueries(['campaigns']) } catch (e) { /* ignore */ }
      }
    } catch (err: any) {
      setResult(`Ошибка запроса: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-6 gap-6">
      <div className="w-full max-w-lg bg-card p-6 rounded shadow">
        <h2 className="text-xl font-bold mb-4">Админ: добавить кампанию</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm">Название</label>
            <input className="w-full border px-2 py-1 rounded" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm">Заказчик</label>
            <input className="w-full border px-2 py-1 rounded" value={client} onChange={e => setClient(e.target.value)} required />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm">Дата начала</label>
              <input type="date" className="w-full border px-2 py-1 rounded" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="flex-1">
              <label className="block text-sm">Дата окончания</label>
              <input type="date" className="w-full border px-2 py-1 rounded" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="block text-sm">Номера ТК (через запятую или пробел)</label>
            <textarea className="w-full border px-2 py-1 rounded" rows={3} value={tkList} onChange={e => setTkList(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm">Примечание</label>
            <input className="w-full border px-2 py-1 rounded" value={note} onChange={e => setNote(e.target.value)} />
            <p className="text-xs text-muted-foreground">Опционально</p>
          </div>

          <div className="flex items-center justify-between">
            <button className="px-4 py-2 bg-primary text-white rounded" type="submit">Сохранить</button>
            {result && <div className="text-sm text-muted-foreground">{result}</div>}
          </div>
        </form>
      </div>

      <div className="flex-1 max-w-3xl">
        <h3 className="text-lg font-semibold mb-3">Список кампаний</h3>
        <CampaignsTable />
      </div>
    </div>
  );
}

export default RebuildAdmin;
