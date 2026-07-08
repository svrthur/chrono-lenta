import React from "react"
import { useGetCampaign, useDeleteCampaign } from "@workspace/api-client-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDate, formatSeconds } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"

interface CampaignDetailSheetProps {
  campaignId: number | null
  onClose: () => void
}

export function CampaignDetailSheet({ campaignId, onClose }: CampaignDetailSheetProps) {
  const { data: campaign, isLoading } = useGetCampaign(campaignId!, {
    query: {
      enabled: !!campaignId,
      queryKey: ["/api/campaigns", campaignId]
    }
  })

  const deleteMutation = useDeleteCampaign()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const handleDelete = async () => {
    if (!campaignId) return
    if (!confirm("Вы уверены, что хотите удалить эту кампанию?")) return

    try {
      await deleteMutation.mutateAsync({ id: campaignId })
      toast({ title: "Кампания удалена", variant: "success" })
      queryClient.invalidateQueries()
      onClose()
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" })
    }
  }

  return (
    <Sheet open={!!campaignId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-md w-full p-0">
        {isLoading ? (
          <div className="p-6 text-muted-foreground text-center mt-10">Загрузка...</div>
        ) : !campaign ? (
          <div className="p-6 text-muted-foreground text-center mt-10">Не найдено</div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-4 border-b bg-muted/10">
              <div className="flex items-start justify-between gap-4">
                <SheetTitle className="text-xl leading-tight">{campaign.name}</SheetTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant={campaign.status === "Платник" ? "default" : "secondary"}>
                  {campaign.status}
                </Badge>
                <Badge variant="outline" className="font-mono bg-background">
                  {formatSeconds(campaign.duration)}
                </Badge>
              </div>
            </SheetHeader>
            
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-1 text-sm border-b pb-4">
                  <div className="text-muted-foreground">Заказчик</div>
                  <div className="col-span-2 font-medium">{campaign.client}</div>
                  
                  <div className="text-muted-foreground mt-2">Период</div>
                  <div className="col-span-2 font-medium mt-2">
                    {formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Размещения ({campaign.shoppingCenters.length})</h4>
                  <div className="space-y-2">
                    {campaign.shoppingCenters.map(sc => (
                      <div key={sc.id} className="flex flex-col p-2 bg-muted/20 border rounded-md text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">ТК №{sc.number}</span>
                          <span className="text-xs text-muted-foreground">{sc.city} ({sc.format})</span>
                        </div>
                        {sc.address && (
                          <span className="text-xs text-muted-foreground mt-1 truncate">{sc.address}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-muted/10 mt-auto">
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2Icon className="w-4 h-4 mr-2" />
                Удалить кампанию
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
