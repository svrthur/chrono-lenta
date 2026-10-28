import React, { useState, useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Home } from "@/pages/Home"
import { RebuildAdmin } from "@/pages/RebuildAdmin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MonitorPlay, Settings, Lock, Unlock, KeyRound } from "lucide-react"
import { MASTER_TK_LIST, TK_QUOTAS } from "@/lib/constants"

const queryClient = new QueryClient()

type ActivePage = "admin" | "board"

const DEFAULT_PIN = "1234"

// Пункт 1: по ссылке в первую очередь ВСЕГДА открывается страница для коллег ('board')
function getInitialPage(): ActivePage {
  const hash = window.location.hash.toLowerCase()
  if (hash === "#admin") {
    const isUnlocked = sessionStorage.getItem("chrono_admin_unlocked") === "true"
    if (isUnlocked) return "admin"
  }
  return "board"
}

export function App() {
  const [page, setPage] = useState<ActivePage>(getInitialPage)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem("chrono_admin_unlocked") === "true"
  })
  const [pinInput, setPinInput] = useState<string>("")
  const [pinError, setPinError] = useState<string>("")
  const [changingPin, setChangingPin] = useState<boolean>(false)
  const [newPin, setNewPin] = useState<string>("")

  useEffect(() => {
    window.location.hash = page === "board" ? "#board" : "#admin"
  }, [page])

  const getSavedPin = () => localStorage.getItem("chrono_admin_pin") || DEFAULT_PIN

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault()
    if (pinInput.trim() === getSavedPin()) {
      setIsUnlocked(true)
      sessionStorage.setItem("chrono_admin_unlocked", "true")
      setPinInput("")
      setPinError("")
    } else {
      setPinError("Неверный ПИН-код")
    }
  }

  const handleLock = () => {
    setIsUnlocked(false)
    sessionStorage.removeItem("chrono_admin_unlocked")
    setChangingPin(false)
    setPage("board")
  }

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPin.trim().length < 4) {
      window.alert("ПИН-код должен содержать минимум 4 символа")
      return
    }
    localStorage.setItem("chrono_admin_pin", newPin.trim())
    setNewPin("")
    setChangingPin(false)
    window.alert("Новый ПИН-код сохранен")
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <header className="border-b bg-card px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold tracking-tight">Chrono Lenta</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                {MASTER_TK_LIST.length} ТК • Квота {TK_QUOTAS.TOTAL_MAX}с ({TK_QUOTAS.PAID_MAX}с / {TK_QUOTAS.FREE_MAX}с)
              </span>
            </div>

            <nav className="flex items-center gap-2">
              {page === "admin" && isUnlocked && (
                <div className="flex items-center gap-1.5 mr-2">
                  {changingPin ? (
                    <form onSubmit={handleSaveNewPin} className="flex items-center gap-1">
                      <Input
                        type="password"
                        placeholder="Новый ПИН..."
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        className="h-7 w-28 text-xs"
                      />
                      <Button type="submit" size="sm" className="h-7 px-2 text-xs">
                        ОК
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setChangingPin(false)}
                      >
                        Отмена
                      </Button>
                    </form>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => setChangingPin(true)}
                      title="Изменить ПИН-код входа в Админку"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Сменить ПИН
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={handleLock}
                    title="Заблокировать панель администратора"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Выйти
                  </Button>
                </div>
              )}

              <Button
                variant={page === "board" ? "default" : "ghost"}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setPage("board")}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                Экраны ТК (Для коллег)
              </Button>

              <Button
                variant={page === "admin" ? "default" : "ghost"}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setPage("admin")}
              >
                {isUnlocked ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Settings className="w-3.5 h-3.5" />
                )}
                Админ (Загрузка данных)
              </Button>
            </nav>
          </header>

          <main className="flex-1">
            {page === "board" ? (
              <RebuildAdmin />
            ) : isUnlocked ? (
              <Home />
            ) : (
              <div className="flex items-center justify-center min-h-[75vh] p-4">
                <form
                  onSubmit={handleUnlock}
                  className="bg-card border rounded-lg shadow-sm p-6 w-full max-w-sm space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-bold">Вход в панель администратора</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Введите ПИН-код для доступа к загрузке и редактированию рекламных кампаний.
                  </p>
                  <div className="space-y-1.5">
                    <Input
                      type="password"
                      placeholder="Введите ПИН-код"
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value)
                        setPinError("")
                      }}
                      autoFocus
                    />
                    {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage("board")}
                    >
                      К экранам ТК
                    </Button>
                    <Button type="submit" size="sm">
                      Войти
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
