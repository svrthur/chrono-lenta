import React from "react"
import { Button } from "@/components/ui/button"
import { useBulkDeleteCampaigns } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { Trash2Icon, XIcon } from "lucide-react"

interface BulkDeleteBarProps {
  selectedIds: number[]
  onClear: () => void
}

export function BulkDeleteBar({ selectedIds, onClear }: BulkDeleteBarProps) {
  const bulkDelete = useBulkDeleteCampaigns()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  if (selectedIds.length === 0) return null

  const handleDelete = async () => {
    if (!confirm(`Удалить выбранные кампании (${selectedIds.length} шт.)?`)) return

    try {
      const res = await bulkDelete.mutateAsync({ data: { ids: selectedIds } })
      if (res.success) {
        toast({ title: "Успешно", description: `Удалено кампаний: ${res.deleted}`, variant: "success" })
        queryClient.invalidateQueries()
        onClear()
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" })
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-primary text-primary-foreground shadow-xl rounded-full px-6 py-3 flex items-center gap-4">
        <span className="font-semibold text-sm">
          Выбрано: {selectedIds.length}
        </span>
        <div className="h-4 w-px bg-primary-foreground/30" />
        <Button 
          variant="destructive" 
          size="sm" 
          className="rounded-full shadow-sm"
          onClick={handleDelete}
          disabled={bulkDelete.isPending}
        >
          <Trash2Icon className="w-4 h-4 mr-2" />
          Удалить
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full hover:bg-primary-foreground/20 text-primary-foreground h-8 w-8 ml-2"
          onClick={onClear}
        >
          <XIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
