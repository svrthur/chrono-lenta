import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Home } from '@/pages/Home';
import { RebuildAdmin } from '@/pages/RebuildAdmin';
import { Route, Switch, Router as WouterRouter, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { MonitorPlay, Settings } from 'lucide-react';

const queryClient = new QueryClient();

function Navbar() {
  const [location] = useLocation();

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight">Chrono Lenta</span>
      </div>
      <nav className="flex items-center gap-2">
        <Link href="/">
          <Button variant={location === '/' ? 'default' : 'ghost'} size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            Админ (Загрузка данных)
          </Button>
        </Link>
        <Link href="/board">
          <Button variant={location === '/board' ? 'default' : 'ghost'} size="sm" className="gap-2">
            <MonitorPlay className="w-4 h-4" />
            Экраны ТК (Для коллег)
          </Button>
        </Link>
      </nav>
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/board" component={RebuildAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1">
              <Router />
            </main>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
