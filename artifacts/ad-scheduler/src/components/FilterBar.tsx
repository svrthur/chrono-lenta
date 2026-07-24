import React from "react"
import { useFilterStore } from "@/store/filters"
import { CITIES } from "@/lib/constants"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { MultiSelect } from "@/components/ui/multi-select"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, PlusIcon, RotateCcwIcon, HistoryIcon } from "lucide-react"
import { useListImportHistory, useRestoreImport } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import { ImportHistoryDialog } from "./ImportHistoryDialog"
import { AddCampaignDialog } from "./AddCampaignDialog"
import { cn } from "@/lib/utils"

export function FilterBar() {
  const filters = useFilterStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)

  const restoreImport = useRestoreImport()
  const { data: history } = useListImportHistory()

  const handleUndoLast = async () => {
    if (!history || history.length === 0) {
      toast({ title: "Нет истории для отмены" })
      return
    }
    const lastImport = history[0]
    try {
      const res = await restoreImport.mutateAsync({ id: lastImport.id })
      if (res.success) {
        toast({
          title: "Отменено",
          description: `Восстановлено кампаний: ${res.restoredCampaigns}`,
          variant: "success",
        })
        queryClient.invalidateQueries()
      }
    } catch (err: any) {
      toast({
        title: "Ошибка отмены",
        description: err.message || "Неизвестная ошибка",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="sticky top-0 z-40 w-full bg-card border-b shadow-sm">
      <div className="flex flex-col p-4 gap-4 max-w-[1920px] mx-auto">
        <div className="flex flex-wrap items-center gap-3">

          <Button onClick={() => setAddOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusIcon className="w-4 h-4 mr-2" />
            Добавить кампанию
          </Button>

          <Button variant="outline" onClick={handleUndoLast} disabled={restoreImport.isPending || !history?.length} title="Отменить последнее добавление">
            <RotateCcwIcon className="w-4 h-4 mr-2" />
            Отменить последнюю
          </Button>

          <Button variant="ghost" onClick={() => setHistoryOpen(true)} title="История">
            <HistoryIcon className="w-4 h-4" />
          </Button>
          
          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !filters.date && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.date ? format(new Date(filters.date), "dd.MM.yyyy", { locale: ru }) : "Дата"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(filters.date)}
                onSelect={(d) => d && filters.setDate(format(d, "yyyy-MM-dd"))}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <MultiSelect
            options={CITIES}
            selected={filters.cities}
            onChange={filters.setCities}
            placeholder="Все города"
            className="w-[200px]"
          />

          <Select value={filters.format || "all"} onValueChange={(v) => filters.setFormat(v === "all" ? null : v as any)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Все ТК" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ТК</SelectItem>
              <SelectItem value="ГМ">ГМ</SelectItem>
              <SelectItem value="СМ">СМ</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.status || "all"} onValueChange={(v) => filters.setStatus(v === "all" ? null : v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="Платник">Платник</SelectItem>
              <SelectItem value="Не платник">Не платник</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Input 
            placeholder="Поиск по кампании" 
            className="w-[200px]"
            value={filters.searchCampaign}
            onChange={(e) => filters.setSearchCampaign(e.target.value)}
          />
          
          <Input 
            placeholder="Поиск по заказчику" 
            className="w-[200px]"
            value={filters.searchClient}
            onChange={(e) => filters.setSearchClient(e.target.value)}
          />

          <Select value={filters.campaignPhase} onValueChange={(v) => filters.setCampaignPhase(v as any)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кампании</SelectItem>
              <SelectItem value="planned">Запланировано</SelectItem>
              <SelectItem value="active">Опубликовано</SelectItem>
              <SelectItem value="finished">Завершено</SelectItem>
            </SelectContent>
          </Select>

        </div>
      </div>
      
      <ImportHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      <AddCampaignDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
