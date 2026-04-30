import { Coins, LayoutDashboard, PanelsTopLeft, SplitSquareVertical } from "lucide-react";

import { cn } from "@/lib/utils";

export type NavKey = "editor" | "dashboard" | "storyboard" | "cost";

const items: Array<{ key: NavKey; label: string; icon: React.ComponentType<{ className?: string }> }> =
  [
    { key: "editor", label: "工作区", icon: SplitSquareVertical },
    { key: "dashboard", label: "控制台", icon: LayoutDashboard },
    { key: "storyboard", label: "分镜编辑", icon: PanelsTopLeft },
    { key: "cost", label: "成本监控", icon: Coins },
  ];

export function Sidebar({
  value,
  onChange,
}: {
  value: NavKey;
  onChange: (k: NavKey) => void;
}) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-slate-950 md:block">
      <nav className="p-2">
        <div className="px-3 py-2 text-xs font-medium text-slate-400">导航</div>
        <div className="space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            const active = it.key === value;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => onChange(it.key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-900 hover:text-slate-50",
                  active && "bg-slate-900 text-slate-50 ring-2 ring-indigo-500/70"
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

