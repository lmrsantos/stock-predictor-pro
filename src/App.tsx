import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Landing from "./pages/Landing.tsx";
import Auth from "./pages/Auth.tsx";
import Portfolio from "./pages/Portfolio.tsx";
import SectorBacktestPage from "./pages/SectorBacktestPage.tsx";
import LinkagesPage from "./pages/LinkagesPage.tsx";
import Pricing from "./pages/Pricing.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";
import Terms from "./pages/Terms.tsx";
import Disclaimer from "./pages/Disclaimer.tsx";
import Privacy from "./pages/Privacy.tsx";
import OAuthConsent from "./pages/OAuthConsent.tsx";
import { DisclaimerBar } from "@/components/DisclaimerBar";
import { LinkageAutoRunner } from "@/components/LinkageAutoRunner";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <LinkageAutoRunner />
          <DisclaimerBar />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/terminal" element={<Index />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/sector-backtest" element={<SectorBacktestPage />} />
            <Route path="/linkages" element={<LinkagesPage />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/account" element={<Account />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/disclaimer" element={<Disclaimer />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
