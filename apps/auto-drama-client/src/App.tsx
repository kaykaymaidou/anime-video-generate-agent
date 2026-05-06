import { useEffect, useMemo, useState } from "react";

import { Header } from "@/components/shared/Header";
import { Sidebar, type NavKey } from "@/components/shared/Sidebar";
import { DashboardPage } from "@/pages/Dashboard";
import { StoryboardPage } from "@/pages/Storyboard";
import { CostPage } from "@/pages/Cost";
import { EditorPage } from "@/pages/Editor";

function App() {
  const [nav, setNav] = useState<NavKey>("editor");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
  }, []);

  const title = useMemo(() => {
    if (nav === "editor") return "Auto-Drama 工作区";
    if (nav === "dashboard") return "Auto-Drama 控制台";
    if (nav === "storyboard") return "Auto-Drama 分镜编辑";
    return "Auto-Drama 成本监控";
  }, [nav]);

  return (
    <div className="min-h-screen">
      <Header title={title} />
      <div className="flex">
        <Sidebar value={nav} onChange={setNav} />
        <main className="flex-1 bg-slate-950">
          <div className={nav === "editor" ? "" : "container py-6"}>
            {nav === "editor" && <EditorPage />}
            {nav === "dashboard" && <DashboardPage />}
            {nav === "storyboard" && <StoryboardPage />}
            {nav === "cost" && <CostPage />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
