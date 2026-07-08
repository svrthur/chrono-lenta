// Minimal use-toast implementation using Sonner internally or simple state
import * as React from "react"

type ToastProps = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: "default" | "destructive" | "success"
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = {
  type: "ADD_TOAST" | "UPDATE_TOAST" | "DISMISS_TOAST" | "REMOVE_TOAST"
  toast?: Partial<ToastProps>
  toastId?: string
}

const toastListeners = new Set<(state: State) => void>()

type State = { toasts: ToastProps[] }
let memoryState: State = { toasts: [] }

function dispatch(action: ActionType) {
  switch (action.type) {
    case "ADD_TOAST":
      memoryState = {
        ...memoryState,
        toasts: [action.toast as ToastProps, ...memoryState.toasts].slice(0, TOAST_LIMIT),
      }
      break
    case "UPDATE_TOAST":
      memoryState = {
        ...memoryState,
        toasts: memoryState.toasts.map((t) =>
          t.id === action.toast?.id ? { ...t, ...action.toast } : t
        ),
      }
      break
    case "DISMISS_TOAST": {
      const id = action.toastId
      if (id) {
        setTimeout(() => {
          dispatch({ type: "REMOVE_TOAST", toastId: id })
        }, 300)
      }
      break
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        memoryState = { ...memoryState, toasts: [] }
      } else {
        memoryState = {
          ...memoryState,
          toasts: memoryState.toasts.filter((t) => t.id !== action.toastId),
        }
      }
      break
  }

  toastListeners.forEach((listener) => listener(memoryState))
}

export function toast({ ...props }: Omit<ToastProps, "id">) {
  const id = genId()
  const update = (props: ToastProps) =>
    dispatch({ type: "UPDATE_TOAST", toast: { ...props, id } })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss()
      },
    },
  })

  setTimeout(() => {
    dismiss()
  }, TOAST_REMOVE_DELAY)

  return { id, dismiss, update }
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    toastListeners.add(setState)
    return () => {
      toastListeners.delete(setState)
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}
