import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { useState, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import WelcomePage from './pages/welcome';
import { setGlobalTier } from '@/hooks/useEntitlements';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
      <h1 className="text-6xl font-display font-bold text-primary drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">404</h1>
      <p className="text-xl font-bold uppercase">As if! This page is totally lost.</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={WardrobePage} />
        <Route path="/generate" component={GeneratePage} />
        <Route path="/saved" component={SavedPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  // Show the welcome screen once per session. The wardrobe pre-loads beneath
  // the overlay so the transition after the door animation is instant.
  const [entered, setEntered] = useState<boolean>(
    () => sessionStorage.getItem("closet-entered") === "1"
  );

  const handleEnter = useCallback(() => {
    sessionStorage.setItem("closet-entered", "1");
    setEntered(true);
  }, []);

  // While the welcome overlay is visible, make the underlying app content
  // inert so keyboard users cannot focus hidden controls behind the doors.
  const routerWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = routerWrapRef.current;
    if (!el) return;
    if (!entered) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  }, [entered]);

  // ── Stripe success callback ──────────────────────────────────────────────────
  // When Stripe redirects back with ?unlock=success&session_id=..., verify the
  // payment server-side before granting access.  The URL params are cleaned up
  // immediately so refreshing doesn't re-trigger the verification.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const unlock = params.get("unlock");
    const sessionId = params.get("session_id");

    if (unlock !== "success" || !sessionId) return;

    // Clean the URL immediately — don't wait for server response.
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("unlock");
    cleanUrl.searchParams.delete("session_id");
    window.history.replaceState({}, "", cleanUrl.toString());

    // Skip past the welcome screen so the user lands in the wardrobe.
    sessionStorage.setItem("closet-entered", "1");
    setEntered(true);

    // Verify with the server and grant tier upgrade.
    fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(({ verified, product }: { verified: boolean; product: string | null }) => {
        if (verified && product === "unlock") setGlobalTier("unlock");
        if (verified && product === "premium") setGlobalTier("premium");
      })
      .catch(() => {
        // Silently ignore — user can contact support if payment isn't reflected.
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <div ref={routerWrapRef}>
          <Router />
        </div>
        {!entered && <WelcomePage onEnter={handleEnter} />}
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
