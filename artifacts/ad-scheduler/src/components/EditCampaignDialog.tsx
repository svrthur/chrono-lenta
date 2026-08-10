import React, { useEffect, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, PlusIcon } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getApiUrl } from "@/lib/api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number | null
}

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45]

export default function EditCampaignDialog({ open, onOpenChange, campaignId }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<any>({ name: '', client: '', startDate: undefined, endDate: undefined, status: 'Платник', duration: '', shoppingCenterNumbers: '', note: '' })

  useEffect(() => {
    if (!campaignId) return
    let mounted = true
    fetch(getApiUrl(`/api/campaigns/${campaignId}`))
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return
        setForm({
          name: data.name || '',
          client: data.client || '',
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          status: data.status || 'Платник',
          duration: String(data.duration || ''),
          shoppingCenterNumbers: (data.shoppingCenters || []).map((s:any)=>s.number).join(', '),
          note: data.note || ''
        })
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [campaignId])

  const set = (key: string, value: any) => setForm((prev:any)=>({...prev,[key]:value}))

  const handleSubmit = async () => {
    // basic validation
    if (!form.name.trim()) return toast({ title: 'Введите название', variant: 'destructive' })
    setLoading(true)
    try {
      const scNumbers = form.shoppingCenterNumbers.split(',').map((s:string)=>s.trim()).filter(Boolean)
      const body = {
        name: form.name.trim(),
        client: form.client.trim(),
        startDate: form.startDate ? format(form.startDate, 'yyyy-MM-dd') : null,
        endDate: form.endDate ? format(form.endDate, 'yyyy-MM-dd') : null,
        status: form.status,
        duration: Number(form.duration),
        shoppingCenterNumbers: scNumbers,
        note: form.note || null
      }
      const res = await fetch(getApiUrl(`/api/campaigns/${campaignId}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(()=> ({}))
        throw new Error(data.error || `Ошибка ${res.status}`)
      }
      toast({ title: 'Обновлено', variant: 'success' })
      queryClient.invalidateQueries(['campaigns'])
      onOpenChange(false)
    } catch (err:any) {
      toast({ title: 'Ошибка', description: String(err.message || err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Редактировать РК</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={form.name} onChange={(e:any)=>set('name', e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Заказчик</Label>
            <Input value={form.client} onChange={(e:any)=>set('client', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Дата старта</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={"justify-start text-left font-normal"}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.startDate ? format(form.startDate, 'dd.MM.yyyy', { locale: ru }) : 'Выбрать'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-2">
                    <Calendar mode="single" selected={form.startDate} onSelect={(d:any)=>set('startDate', d)} initialFocus />
                    <div className="mt-2"><Input type="date" value={form.startDate ? form.startDate.toISOString().slice(0,10) : ''} onChange={(e:any)=>set('startDate', e.target.value ? new Date(e.target.value) : undefined)} /></div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-1.5">
              <Label>Дата окончания</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={"justify-start text-left font-normal"}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.endDate ? format(form.endDate, 'dd.MM.yyyy', { locale: ru }) : 'Выбрать'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-2">
                    <Calendar mode="single" selected={form.endDate} onSelect={(d:any)=>set('endDate', d)} initialFocus />
                    <div className="mt-2"><Input type="date" value={form.endDate ? form.endDate.toISOString().slice(0,10) : ''} onChange={(e:any)=>set('endDate', e.target.value ? new Date(e.target.value) : undefined)} /></div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Статус (Платник/Не платник)</Label>
              <Select value={form.status} onValueChange={(v:any)=>set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Платник">Платник</SelectItem>
                  <SelectItem value="Не платник">Не платник</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Длительность</Label>
              <Select value={form.duration} onValueChange={(v:any)=>set('duration', v)}>
                <SelectTrigger><SelectValue placeholder="Выбрать" /></SelectTrigger>
                <SelectContent>{DURATION_OPTIONS.map(sec=> <SelectItem key={sec} value={String(sec)}>{sec} сек</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Номера ТК</Label>
            <Input value={form.shoppingCenterNumbers} onChange={(e:any)=>set('shoppingCenterNumbers', e.target.value)} />
            <p className="text-xs text-muted-foreground">Введите номера через запятую</p>
          </div>

          <div className="grid gap-1.5">
            <Label>Примечание</Label>
            <Input value={form.note} onChange={(e:any)=>set('note', e.target.value)} />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)} disabled={loading}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}><PlusIcon className="w-4 h-4 mr-2" />{loading ? 'Сохранение...' : 'Сохранить'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
