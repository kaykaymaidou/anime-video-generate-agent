import type { ReactNode } from "react";
import { Film } from "lucide-react";

export function Header({
  nav,
  trailing,
}: {
  /** 顶栏主导航（如 shadcn Tabs） */
  nav: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-white/10 bg-slate-950 px-3 sm:gap-3 sm:px-4">
      <div className="flex shrink-0 items-center gap-2">
        <Film className="h-5 w-5 shrink-0 text-slate-50" />
        <span className="hidden font-semibold text-slate-50 sm:inline sm:max-w-[11rem] sm:truncate md:max-w-none">
          Anime Video Generate Agent
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {nav}
      </div>
      <div className="hidden shrink-0 text-xs text-slate-400 md:block">
        {trailing ?? "电影工业级工作区（深色模式优先）"}
      </div>
    </header>
  );
}

