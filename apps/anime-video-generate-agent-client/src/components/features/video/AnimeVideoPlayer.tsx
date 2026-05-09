import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type AnimeVideoPlayerProps = {
  src: string | null;
  className?: string;
  videoClassName?: string;
  /** 无障碍标题 */
  title?: string;
};

/**
 * 自定义播放控件（替代原生 controls），便于暗色 UI 与触控区域一致。
 */
export function AnimeVideoPlayer({ src, className, videoClassName, title = "视频预览" }: AnimeVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.volume = volume;
  }, [muted, volume]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    v.pause();
    v.currentTime = 0;
    v.load();
  }, [src]);

  const pct = useMemo(() => {
    if (!duration) return 0;
    return Math.min(100, Math.max(0, (current / duration) * 100));
  }, [current, duration]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const v = videoRef.current;
      if (!v || !duration) return;
      const r = Math.min(1, Math.max(0, ratio));
      v.currentTime = r * duration;
      setCurrent(v.currentTime);
    },
    [duration]
  );

  const onScrubPointer = useCallback(
    (clientX: number) => {
      const el = scrubRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      seekToRatio(ratio);
    },
    [duration, seekToRatio]
  );

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    if (v.paused) {
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [src]);

  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const anyEl = v as unknown as { requestFullscreen?: () => Promise<void> };
    void anyEl.requestFullscreen?.();
  }, []);

  if (!src) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
        <video
          ref={videoRef}
          className={cn("block max-h-[min(52vh,560px)] w-full bg-black object-contain", videoClassName)}
          playsInline
          preload="metadata"
          src={src}
          title={title}
          onClick={() => togglePlay()}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(v.duration || 0);
          }}
          onTimeUpdate={(e) => {
            if (!draggingRef.current) setCurrent(e.currentTarget.currentTime);
          }}
          onEnded={() => setPlaying(false)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2">
        <div
          ref={scrubRef}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="group relative h-8 cursor-pointer touch-none select-none py-2"
          onPointerDown={(e) => {
            draggingRef.current = true;
            scrubRef.current?.setPointerCapture(e.pointerId);
            onScrubPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            onScrubPointer(e.clientX);
          }}
          onPointerUp={(e) => {
            draggingRef.current = false;
            onScrubPointer(e.clientX);
            scrubRef.current?.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          <div className="h-1.5 w-full rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-indigo-500 transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-indigo-200 opacity-0 shadow ring-2 ring-indigo-600/40 transition-opacity group-hover:opacity-100"
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" className="h-9 min-w-9 px-2" onClick={() => togglePlay()}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <span className="font-mono text-[11px] text-slate-400">
            {formatClock(current)} / {formatClock(duration)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 min-w-9 px-2 text-slate-300"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "取消静音" : "静音"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const nv = Number(e.target.value);
                setVolume(nv);
                if (nv > 0) setMuted(false);
              }}
              className="h-1 w-24 cursor-pointer accent-indigo-500"
              aria-label="音量"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-w-9 px-2"
              onClick={() => toggleFullscreen()}
              aria-label="全屏"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
