import { Film } from "lucide-react";

export function Header({
  title,
}: {
  title: string;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-white/10 bg-slate-950 px-4">
      <div className="flex items-center gap-2">
        <Film className="h-5 w-5 text-slate-50" />
        <div className="font-semibold text-slate-50">{title}</div>
      </div>
      <div className="text-xs text-slate-400">电影工业级工作区（深色模式优先）</div>
    </header>
  );
}

