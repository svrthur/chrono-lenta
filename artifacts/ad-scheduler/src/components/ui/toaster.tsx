import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <div
            key={id}
            className={cn(
              "group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all mb-2",
              variant === "destructive" ? "destructive group border-destructive bg-destructive text-destructive-foreground" :
              variant === "success" ? "border-success bg-success text-success-foreground" : "bg-background border"
            )}
            {...props}
          >
            <div className="grid gap-1">
              {title && <div className="text-sm font-semibold">{title}</div>}
              {description && (
                <div className="text-sm opacity-90">{description}</div>
              )}
            </div>
            {action}
            <button
              onClick={() => dismiss(id)}
              className="absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-1 group-hover:opacity-100"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
