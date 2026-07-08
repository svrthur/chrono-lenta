import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetGridQueryKey, getGetStatisticsQueryKey, getGetKpiQueryKey, getListImportHistoryQueryKey, getListCampaignsQueryKey } from "@workspace/api-client-react"

export function useServerEvents() {
  const queryClient = useQueryClient()

  React.useEffect(() => {
    const evtSource = new EventSource("/api/events")
    
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "data-updated") {
          // Invalidate relevant queries to fetch fresh data
          queryClient.invalidateQueries({ queryKey: ["/api/grid"] })
          queryClient.invalidateQueries({ queryKey: ["/api/statistics"] })
          queryClient.invalidateQueries({ queryKey: ["/api/kpi"] })
          queryClient.invalidateQueries({ queryKey: ["/api/import-history"] })
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] })
        }
      } catch (err) {
        console.error("SSE parsing error", err)
      }
    }

    evtSource.onerror = (err) => {
      console.error("EventSource failed:", err)
    }

    return () => {
      evtSource.close()
    }
  }, [queryClient])
}
