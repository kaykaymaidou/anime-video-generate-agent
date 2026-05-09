import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export type TimelineClipInput = {
  order: number;
  url: string;
};

export type TimelineConcatTransition = "none" | "fade";

/** concat demuxer 一行：路径中的单引号按 ffmpeg 规则转义 */
function concatDemuxerLine(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const escaped = normalized.replace(/'/g, "'\\''");
  return `file '${escaped}'`;
}

@Injectable()
export class TimelineConcatService {
  private readonly log = new Logger(TimelineConcatService.name);

  constructor(private readonly config: ConfigService) {}

  async concatToExports(
    clips: TimelineClipInput[],
    opts?: { transition?: TimelineConcatTransition }
  ): Promise<{
    filename: string;
    /** 相对当前 HTTP 服务的播放路径 */
    publicPath: string;
    clipCount: number;
  }> {
    const max = Math.max(2, Math.min(120, Number(this.config.get("TIMELINE_CONCAT_MAX_CLIPS") ?? 80)));
    const fadeMax = Math.max(2, Math.min(24, Number(this.config.get("TIMELINE_FADE_MAX_CLIPS") ?? 14)));
    const perDlMs = Math.max(30_000, Number(this.config.get("TIMELINE_DOWNLOAD_TIMEOUT_MS") ?? 180_000));

    const sorted = [...clips]
      .filter((c) => typeof c.url === "string" && c.url.trim())
      .sort((a, b) => a.order - b.order);

    if (sorted.length < 2) {
      throw new BadRequestException("至少需要 2 个带有效 URL 的镜头成片才能拼接");
    }
    if (sorted.length > max) {
      throw new BadRequestException(`镜头数量超过上限 ${max}，请分批导出`);
    }

    const transition: TimelineConcatTransition = opts?.transition === "fade" ? "fade" : "none";
    if (transition === "fade" && sorted.length > fadeMax) {
      throw new BadRequestException(
        `淡入淡出拼接最多 ${fadeMax} 段（可调 TIMELINE_FADE_MAX_CLIPS）；当前 ${sorted.length} 段请改硬切或分批`
      );
    }

    const ffmpegBin = String(this.config.get("FFMPEG_PATH") ?? "ffmpeg").trim() || "ffmpeg";
    const ffprobeBin = this.resolveFfprobeBin(ffmpegBin);
    const exportsDir = path.join(process.cwd(), "storage", "exports");
    await fs.mkdir(exportsDir, { recursive: true });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ad-timeline-"));
    const inputPaths: string[] = [];

    try {
      for (let i = 0; i < sorted.length; i++) {
        const raw = sorted[i].url.trim();
        if (!/^https?:\/\//i.test(raw)) {
          throw new BadRequestException("仅允许 http(s) 外链视频地址");
        }
        const dest = path.join(workDir, `seg_${String(i).padStart(4, "0")}.mp4`);
        await this.downloadToFile(raw, dest, perDlMs);
        inputPaths.push(dest);
      }

      const listPath = path.join(workDir, "concat.txt");
      const listBody = inputPaths.map((p) => concatDemuxerLine(path.resolve(p))).join("\n") + "\n";
      await fs.writeFile(listPath, listBody, "utf8");

      const filename = `master_${Date.now()}_${randomUUID().slice(0, 8)}.mp4`;
      const outAbs = path.join(exportsDir, filename);

      if (transition === "fade") {
        const normPaths: string[] = [];
        for (let i = 0; i < inputPaths.length; i++) {
          const np = path.join(workDir, `norm_${String(i).padStart(4, "0")}.mp4`);
          await this.normalizeClipForFade(ffmpegBin, inputPaths[i], np);
          normPaths.push(np);
        }
        const durations = await Promise.all(
          normPaths.map((p) => this.probeDurationSec(ffprobeBin, p))
        );
        await this.runFfmpegXfade(ffmpegBin, normPaths, durations, outAbs);
        this.log.log(`timeline xfade ok -> ${filename} (${sorted.length} clips)`);
      } else {
        await this.runFfmpegCopy(ffmpegBin, listPath, outAbs);
        this.log.log(`timeline concat ok -> ${filename} (${sorted.length} clips)`);
      }

      return {
        filename,
        publicPath: `/exports/${filename}`,
        clipCount: sorted.length,
      };
    } catch (e: unknown) {
      if (e instanceof BadRequestException) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`timeline concat failed: ${msg}`);
      throw new InternalServerErrorException(msg);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async downloadToFile(url: string, dest: string, timeoutMs: number): Promise<void> {
    const ac = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, { signal: ac, redirect: "follow" });
    if (!res.ok) {
      throw new Error(`下载片段失败 HTTP ${res.status}: ${url.slice(0, 120)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const maxMb = Math.max(50, Number(this.config.get("TIMELINE_MAX_CLIP_MB") ?? 80));
    if (buf.length > maxMb * 1024 * 1024) {
      throw new BadRequestException(`单个成片超过 ${maxMb}MB，拒绝下载`);
    }
    await fs.writeFile(dest, buf);
  }

  private resolveFfprobeBin(ffmpegBin: string): string {
    const explicit = String(this.config.get("FFPROBE_PATH") ?? "").trim();
    if (explicit) return explicit;
    const fb = ffmpegBin.replace(/\\/g, "/");
    if (/ffmpeg\.exe$/i.test(fb)) return fb.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
    if (/ffmpeg$/i.test(fb)) return fb.replace(/ffmpeg$/i, "ffprobe");
    return "ffprobe";
  }

  private probeDurationSec(ffprobeBin: string, filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const args = ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath];
      const child = spawn(ffprobeBin, args, { windowsHide: true });
      let out = "";
      child.stdout?.on("data", (d: Buffer) => {
        out += d.toString();
      });
      child.stderr?.on("data", () => {});
      child.on("error", (e) => reject(e));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe 退出码 ${code}`));
          return;
        }
        const n = Number.parseFloat(out.trim());
        resolve(Number.isFinite(n) && n > 0.2 ? n : 1);
      });
    });
  }

  private normalizeClipForFade(ffmpegBin: string, inPath: string, outPath: string): Promise<void> {
    const vf =
      "scale=1280:720:force_original_aspect_ratio=decrease," +
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black";
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inPath,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-an",
      outPath,
    ];
    return this.spawnFfmpeg(ffmpegBin, args);
  }

  private runFfmpegXfade(
    ffmpegBin: string,
    files: string[],
    durations: number[],
    outPath: string
  ): Promise<void> {
    if (files.length < 2 || files.length !== durations.length) {
      return Promise.reject(new Error("xfade 参数无效"));
    }
    const fadeDur = Math.min(
      0.42,
      Math.max(0.12, Math.min(...durations) * 0.22)
    );
    const parts: string[] = [];
    let prev = "[0:v]";
    for (let i = 1; i < files.length; i++) {
      const sum = durations.slice(0, i).reduce((a, b) => a + b, 0);
      const offset = Math.max(0.08, sum - fadeDur * i);
      const curIn = `[${i}:v]`;
      const outLabel = i < files.length - 1 ? `[vx${i}]` : "[vout]";
      parts.push(
        `${prev}${curIn}xfade=transition=fade:duration=${fadeDur.toFixed(4)}:offset=${offset.toFixed(4)}${outLabel}`
      );
      prev = outLabel;
    }
    const fc = parts.join(";");
    const args = ["-hide_banner", "-loglevel", "error", "-y"];
    for (const f of files) args.push("-i", f);
    args.push(
      "-filter_complex",
      fc,
      "-map",
      "[vout]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-an",
      outPath
    );
    return this.spawnFfmpeg(ffmpegBin, args);
  }

  private spawnFfmpeg(ffmpegBin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let err = "";
      child.stderr?.on("data", (d: Buffer) => {
        err += d.toString();
      });
      child.on("error", (e) => reject(e));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else {
          const tail = err.trim().slice(-1500);
          reject(new Error(`ffmpeg 退出码 ${code}：${tail || "(无 stderr)"}`));
        }
      });
    });
  }

  private runFfmpegCopy(ffmpegBin: string, listPath: string, outPath: string): Promise<void> {
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath];
    return this.spawnFfmpeg(ffmpegBin, args);
  }
}
