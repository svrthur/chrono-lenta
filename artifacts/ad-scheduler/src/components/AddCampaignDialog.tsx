import React, { useState } from "react"
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

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45]

interface FormState {
  name: string
  client: string
  startDate: Date | undefined
  endDate: Date | undefined
  status: "Платник" | "Не платник"
  duration: string
  shoppingCenterNumbers: string
}

const emptyForm = (): FormState => ({
  name: "",
  client: "",
  startDate: undefined,
  endDate: undefined,
  status: "Платник",
  duration: "",
  shoppingCenterNumbers: "",
})

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddCampaignDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) errs.name = "Введите название"
    if (!form.client.trim()) errs.client = "Введите заказчика"
    if (!form.startDate) errs.startDate = "Выберите дату"
    if (!form.endDate) errs.endDate = "Выберите дату"
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      errs.endDate = "Дата окончания раньше даты начала"
    if (!form.duration) errs.duration = "Выберите длительность"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const scNumbers = form.shoppingCenterNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const body = {
        name: form.name.trim(),
        client: form.client.trim(),
        startDate: format(form.startDate!, "yyyy-MM-dd"),
        endDate: format(form.endDate!, "yyyy-MM-dd"),
        status: form.status,
        duration: Number(form.duration),
        shoppingCenterNumbers: scNumbers,
      }

      const res = await fetch(getApiUrl("/api/campaigns"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Ошибка ${res.status}`)
      }

      toast({ title: "Кампания добавлена", variant: "success" })
      queryClient.invalidateQueries()
      setForm(emptyForm())
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Новая рекламная кампания</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Название */}
          <div className="grid gap-1.5">
            <Label>Название рекламной кампании <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Введите название"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={cn(errors.name && "border-destructive")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Заказчик */}
          <div className="grid gap-1.5">
            <Label>Заказчик <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Введите заказчика"
              value={form.client}
              onChange={(e) => set("client", e.target.value)}
              className={cn(errors.client && "border-destructive")}
            />
            {errors.client && <p className="text-xs text-destructive">{errors.client}</p>}
          </div>

          {/* Даты */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Дата старта <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("justify-start text-left font-normal", !form.startDate && "text-muted-foreground", errors.startDate && "border-destructive")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.startDate ? format(form.startDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-2">
                    <Calendar
                      mode="single"
                      selected={form.startDate}
                      onSelect={(d) => set("startDate", d)}
                      initialFocus
                    />
                    <div className="mt-2">
                      <Input
                        type="date"
                        value={form.startDate ? (form.startDate.toISOString().slice(0,10)) : ""}
                        onChange={(e) => set("startDate", e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label>Дата окончания <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("justify-start text-left font-normal", !form.endDate && "text-muted-foreground", errors.endDate && "border-destructive")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.endDate ? format(form.endDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-2">
                    <Calendar
                      mode="single"
                      selected={form.endDate}
                      onSelect={(d) => set("endDate", d)}
                      initialFocus
                      disabled={form.startDate ? { before: form.startDate } : undefined}
                    />
                    <div className="mt-2">
                      <Input
                        type="date"
                        value={form.endDate ? (form.endDate.toISOString().slice(0,10)) : ""}
                        onChange={(e) => set("endDate", e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
            </div>
          </div>

          {/* Статус и Длительность */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Статус</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Платник">Платник</SelectItem>
                  <SelectItem value="Не платник">Не платник</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Длительность <span className="text-destructive">*</span></Label>
              <Select value={form.duration} onValueChange={(v) => set("duration", v)}>
                <SelectTrigger className={cn(errors.duration && "border-destructive")}>
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((sec) => (
                    <SelectItem key={sec} value={String(sec)}>{sec} сек</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.duration && <p className="text-xs text-destructive">{errors.duration}</p>}
            </div>
          </div>

          {/* Номера ТК */}
          <div className="grid gap-1.5">
            <Label>Номера торговых центров</Label>
            <Input
              placeholder="Например: 101, 102, 105"
              value={form.shoppingCenterNumbers}
              onChange={(e) => set("shoppingCenterNumbers", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Введите номера через запятую</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <PlusIcon className="w-4 h-4 mr-2" />
            {loading ? "Сохранение..." : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
