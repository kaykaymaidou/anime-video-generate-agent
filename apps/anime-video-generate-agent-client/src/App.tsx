import { useEffect, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/shared/Header";
import { DashboardPage } from "@/pages/Dashboard";
import { CostPage } from "@/pages/Cost";
import { EditorPage } from "@/pages/Editor";

export type AppNavKey = "editor" | "dashboard" | "cost";

function App() {
  const [nav, setNav] = useState<AppNavKey>("editor");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
  }, []);

  return (
    <TooltipProvider delayDuration={280}>
      <div className="min-h-screen">
        <Header
          nav={
            <Tabs value={nav} onValueChange={(v) => setNav(v as AppNavKey)} className="w-max max-w-full">
              <TabsList className="h-9 flex-wrap justify-start gap-0.5 bg-slate-900/90 p-1 ring-1 ring-white/10">
                <TabsTrigger
                  value="editor"
                  className="px-2.5 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 sm:px-3 sm:text-sm"
                >
                  工作区
                </TabsTrigger>
                <TabsTrigger
                  value="dashboard"
                  className="px-2.5 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 sm:px-3 sm:text-sm"
                >
                  控制台
                </TabsTrigger>
                <TabsTrigger
                  value="cost"
                  className="px-2.5 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 sm:px-3 sm:text-sm"
                >
                  成本监控
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
        <main className="bg-slate-950">
          <div className={nav === "editor" ? "" : "container py-6"}>
            {nav === "editor" && <EditorPage />}
            {nav === "dashboard" && <DashboardPage />}
            {nav === "cost" && <CostPage />}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
