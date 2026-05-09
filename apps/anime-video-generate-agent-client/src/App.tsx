import { useEffect, useMemo, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/shared/Header";
import { Sidebar, type NavKey } from "@/components/shared/Sidebar";
import { DashboardPage } from "@/pages/Dashboard";
import { CostPage } from "@/pages/Cost";
import { EditorPage } from "@/pages/Editor";

function App() {
  const [nav, setNav] = useState<NavKey>("editor");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
  }, []);

  const title = useMemo(() => {
    if (nav === "editor") return "Anime Video Generate Agent · 工作区";
    if (nav === "dashboard") return "Anime Video Generate Agent · 控制台";
    return "Anime Video Generate Agent · 成本";
  }, [nav]);

  return (
    <TooltipProvider delayDuration={280}>
      <div className="min-h-screen">
        <Header title={title} />
        <div className="flex">
          <Sidebar value={nav} onChange={setNav} />
          <main className="flex-1 bg-slate-950">
            <div className={nav === "editor" ? "" : "container py-6"}>
              {nav === "editor" && <EditorPage />}
              {nav === "dashboard" && <DashboardPage />}
              {nav === "cost" && <CostPage />}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
