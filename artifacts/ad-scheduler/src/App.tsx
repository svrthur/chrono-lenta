import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Home } from '@/pages/Home';
import { RebuildAdmin } from '@/pages/RebuildAdmin';
import { Button } from '@/components/ui/button';
import { MonitorPlay, Settings } from 'lucide-react';

const queryClient = new QueryClient();

type ActivePage = 'admin' | 'board';

function getInitialPage(): ActivePage {
  const path = window.location.pathname;
  const hash = window.location.hash;
  if (path.includes('board') || hash.includes('board')) return 'board';
  const saved = localStorage.getItem('chrono_active_page');
  if (saved === 'board' || saved === 'admin') return saved;
  return 'admin';
}

export function App() {
  const [page, setPage] = useState<ActivePage>(getInitialPage);

  useEffect(() => {
    localStorage.setItem('chrono_active_page', page);
    window.location.hash = page === 'board' ? '#board' : '#admin';
  }, [page]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <header className="border-b bg-card px-4 py-2.5 flex items-center justify-between sticky top-0 z-50 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold tracking-tight">Chrono Lenta</span>
            </div>
            <nav className="flex items-center gap-2">
              <Button
                variant={page === 'admin' ? 'default' : 'ghost'}
                size="sm"
                className="gap-2 h-8 text-xs"
                onClick={() => setPage('admin')}
              >
                <Settings className="w-3.5 h-3.5" />
                Админ (Загрузка данных)
              </Button>
              <Button
                variant={page === 'board' ? 'default' : 'ghost'}
                size="sm"
                className="gap-2 h-8 text-xs"
                onClick={() => setPage('board')}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                Экраны ТК (Для коллег)
              </Button>
            </nav>
          </header>

          <main className="flex-1">
            {page === 'admin' ? <Home /> : <RebuildAdmin />}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
