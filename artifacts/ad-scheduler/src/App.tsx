import React, { useState, useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Home } from "@/pages/Home"
import { RebuildAdmin } from "@/pages/RebuildAdmin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MonitorPlay, Settings, Lock, Unlock, KeyRound } from "lucide-react"

const queryClient = new QueryClient()

type ActivePage = "admin" | "board"

const PIN_STORAGE_KEY = "chrono_admin_pin"
const AUTH_STORAGE_KEY = "chrono_admin_unlocked"

function getInitialPage(): ActivePage {
  const path = window.location.pathname
  const hash = window.location.hash
  if (path.includes("board") || hash.includes("board")) return "board"
  if (path.includes("admin") || hash.includes("admin")) return "admin"
  const saved = localStorage.getItem("chrono_active_page")
  if (saved === "board" || saved === "admin") return saved
  return "board"
}

export function App() {
  const [page, setPage] = useState<ActivePage>(getInitialPage)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(AUTH_STORAGE_KEY) === "true"
  })
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState("")
  const [changingPin, setChangingPin] = useState(false)
  const [newPin, setNewPin] = useState("")

  const currentPin = localStorage.getItem(PIN_STORAGE_KEY) || "1234"

  useEffect(() => {
    localStorage.setItem("chrono_active_page", page)
    window.location.hash = page === "board" ? "#board" : "#admin"
  }, [page])

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault()
    if (pinInput.trim() === currentPin) {
      setIsUnlocked(true)
      localStorage.setItem(AUTH_STORAGE_KEY, "true")
      setPinInput("")
      setPinError("")
    } else {
      setPinError("Неверный ПИН-код")
    }
  }

  const handleLock = () => {
    setIsUnlocked(false)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setChangingPin(false)
    setPage("board")
  }

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPin.trim().length < 4) {
      alert("ПИН-код должен содержать минимум 4 символа")
      return
    }
    localStorage.setItem(PIN_STORAGE_KEY, newPin.trim())
    setNewPin("")
    setChangingPin(false)
    alert("Новый ПИН-код успешно сохранен!")
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <header className="border-b bg-card px-4 py-2.5 flex items-center justify-between sticky top-0 z-50 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold tracking-tight">Chrono Lenta</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                Календарь ТК
              </span>
            </div>

            <nav className="flex items-center gap-2">
              <Button
                variant={page === "board" ? "default" : "ghost"}
                size="sm"
                className="gap-2 h-8 text-xs"
                onClick={() => setPage("board")}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                Экраны ТК (Для коллег)
              </Button>

              <Button
                variant={page === "admin" ? "default" : "ghost"}
                size="sm"
                className="gap-2 h-8 text-xs"
                onClick={() => setPage("admin")}
              >
                {isUnlocked ? (
                  <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                Админ (Загрузка данных)
              </Button>

              {isUnlocked && page === "admin" && (
                <div className="flex items-center gap-1 ml-2 pl-2 border-l">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setChangingPin((v) => !v)}
                  >
                    <KeyRound className="w-3 h-3 mr-1" />
                    Сменить ПИН
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={handleLock}
                    title="Заблокировать панель админа"
                  >
                    <Lock className="w-3 h-3 mr-1" />
                    Выйти
                  </Button>
                </div>
              )}
            </nav>
          </header>

          {changingPin && isUnlocked && (
            <div className="bg-muted/60 border-b px-4 py-2 flex items-center justify-end gap-2 text-xs">
              <form onSubmit={handleSaveNewPin} className="flex items-center gap-2">
                <span className="text-muted-foreground">Новый ПИН-код админа:</span>
                <Input
                  type="password"
                  placeholder="Минимум 4 символа"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="h-7 w-40 text-xs"
                />
                <Button type="submit" size="sm" className="h-7 text-xs">
                  Сохранить
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setChangingPin(false)}
                >
                  Отмена
                </Button>
              </form>
            </div>
          )}

          <main className="flex-1">
            {page === "board" ? (
              <RebuildAdmin />
            ) : isUnlocked ? (
              <Home />
            ) : (
              <div className="min-h-[75vh] flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-card border rounded-lg shadow-sm p-6 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-full bg-primary/10 text-primary">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold">Доступ администратора</h2>
                      <p className="text-xs text-muted-foreground">
                        Введите ПИН-код для загрузки и редактирования РК
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleUnlock} className="space-y-3">
                    <Input
                      type="password"
                      placeholder="Введите ПИН-код (по умолчанию 1234)"
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value)
                        setPinError("")
                      }}
                      autoFocus
                    />
                    {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
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
