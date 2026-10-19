import React, { useEffect, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, CheckIcon } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { getApiUrl } from "@/lib/api"
import { DURATION_OPTIONS, FORMAT_OPTIONS, TYPE_OPTIONS } from "./AddCampaignDialog"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number | null
}

export default function EditCampaignDialog({ open, onOpenChange, campaignId }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<{
    name: string
    startDate: Date | undefined
    endDate: Date | undefined
    client: string
    duration: string
    format: string
    type: string
    shoppingCenterNumbers: string
  }>({
    name: "",
    startDate: undefined,
    endDate: undefined,
    client: "",
    duration: "30",
    format: "ГМ",
    type: "Не платник",
    shoppingCenterNumbers: "",
  })

  useEffect(() => {
    if (!campaignId) return
    let mounted = true
    fetch(getApiUrl(`/api/campaigns/${campaignId}`))
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return
        const isPaid =
          data.status === "Платник" ||
          data.status === "платный" ||
          (data.note && data.note.toLowerCase().includes("платн") && !data.note.toLowerCase().includes("не "))

        setForm({
          name: data.name || "",
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          client: data.client || "",
          duration: String(data.duration || "30"),
          format: data.tkType || data.tk_type || "ГМ",
          type: isPaid ? "Платник" : "Не платник",
          shoppingCenterNumbers: (data.shoppingCenters || []).map((s: any) => s.number).join(", "),
        })
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [campaignId])

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast({ title: "Введите название", variant: "destructive" })
    if (!form.startDate || !form.endDate) return toast({ title: "Выберите даты старта и окончания", variant: "destructive" })
    if (form.startDate > form.endDate) return toast({ title: "Дата окончания раньше даты старта", variant: "destructive" })

    setLoading(true)
    try {
      const scNumbers = form.shoppingCenterNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const body = {
        name: form.name.trim(),
        startDate: format(form.startDate, "yyyy-MM-dd"),
        endDate: format(form.endDate, "yyyy-MM-dd"),
        client: form.client.trim(),
        duration: Number(form.duration),
        tkType: form.format,
        tk_type: form.format,
        status: form.type,
        shoppingCenterNumbers: scNumbers,
        note: form.type === "Платник" ? "платный" : "не платный",
      }

      const res = await fetch(getApiUrl(`/api/campaigns/${campaignId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Ошибка ${res.status}`)
      }

      toast({ title: "Данные обновлены", variant: "success" })
      queryClient.invalidateQueries()
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: "Ошибка", description: String(err.message || err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Редактирование данных кампании</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Дата старта</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.startDate ? format(form.startDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.startDate}
                    onSelect={(d) => set("startDate", d)}
                    locale={ru}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-1.5">
              <Label>Дата окончания</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.endDate ? format(form.endDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.endDate}
                    onSelect={(d) => set("endDate", d)}
                    locale={ru}
                    initialFocus
                    disabled={form.startDate ? { before: form.startDate } : undefined}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Заказчик</Label>
            <Input value={form.client} onChange={(e) => set("client", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Длительность</Label>
              <Select value={form.duration} onValueChange={(v) => set("duration", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((sec) => (
                    <SelectItem key={sec} value={String(sec)}>
                      {sec} сек
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Формат</Label>
              <Select value={form.format} onValueChange={(v) => set("format", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      {fmt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Тип</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Список ТК</Label>
            <Input
              placeholder="Например: 1, 2, 15, 104"
              value={form.shoppingCenterNumbers}
              onChange={(e) => set("shoppingCenterNumbers", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Укажите номера ТК через запятую</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <CheckIcon className="w-4 h-4 mr-2" />
            {loading ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
