from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests


@dataclass
class SeedanceConfig:
    api_key: str
    base_url: str
    create_path: str
    get_path: str
    cancel_path: str
    seedance2_model: str
    seedance2_fast_model: str


def get_default_config() -> SeedanceConfig:
    return SeedanceConfig(
        api_key=os.getenv("SEEDANCE_API_KEY", ""),
        base_url=os.getenv("VOLC_ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
        create_path=os.getenv("VOLC_VIDEO_CREATE_PATH", "/videos"),
        get_path=os.getenv("VOLC_VIDEO_GET_PATH", "/videos/{id}"),
        cancel_path=os.getenv("VOLC_VIDEO_CANCEL_PATH", "/videos/{id}"),
        seedance2_model=os.getenv("VOLC_SEEDANCE_2_MODEL", "Doubao-Seedance-2.0"),
        seedance2_fast_model=os.getenv("VOLC_SEEDANCE_2_FAST_MODEL", "Doubao-Seedance-2.0-Fast"),
    )


def validate_params(*, resolution: str, duration: int, model_type: str):
    if model_type not in ("seedance2.0", "seedance2.0fast"):
        raise ValueError("model_type must be seedance2.0 or seedance2.0fast")
    if duration <= 0 or duration > 15:
        raise ValueError("duration must be 1..15 seconds")
    if resolution not in ("1080P", "720P", "1080p", "720p"):
        raise ValueError("resolution must be 1080P/720P")


def build_create_payload(
    *,
    cfg: SeedanceConfig,
    prompt: str,
    model_type: str,
    resolution: str,
    duration: int,
    withsound: bool,
    img_urls: Optional[List[str]] = None,
    frame_image_url: Optional[str] = None,
) -> Dict[str, Any]:
    validate_params(resolution=resolution, duration=duration, model_type=model_type)
    model = cfg.seedance2_fast_model if model_type == "seedance2.0fast" else cfg.seedance2_model
    body: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "duration": int(duration),
        "seconds": int(duration),
        "resolution": resolution,
        "withsound": bool(withsound),
        "generate_audio": bool(withsound),
    }
    if img_urls:
        body["img_urls"] = img_urls
        body["img_url"] = img_urls[0]
    if frame_image_url:
        body["frame_image_url"] = frame_image_url
    return body


@dataclass
class SeedanceResult:
    video_url: str
    cost_yuan: float


def _join(base: str, p: str) -> str:
    return base.rstrip("/") + "/" + p.lstrip("/")


def create_and_poll(
    *,
    cfg: SeedanceConfig,
    prompt: str,
    model_type: str,
    img_urls: Optional[List[str]] = None,
    frame_image_url: Optional[str] = None,
    withsound: bool = True,
    duration: int = 5,
    timeout_s: int = 180,
    session: Optional[requests.Session] = None,
    on_event=None,
) -> SeedanceResult:
    sess = session or requests.Session()
    headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"}

    resolution = "720P" if model_type == "seedance2.0fast" else "1080P"
    body = build_create_payload(
        cfg=cfg,
        prompt=prompt,
        model_type=model_type,
        resolution=resolution,
        duration=duration,
        withsound=withsound,
        img_urls=img_urls,
        frame_image_url=frame_image_url,
    )
    create_url = _join(cfg.base_url, cfg.create_path)
    r = sess.post(create_url, headers=headers, json=body, timeout=60)
    r.raise_for_status()
    data = r.json()
    task_id = data.get("id") or data.get("task_id") or (data.get("data") or {}).get("id")
    if not task_id:
        raise RuntimeError("missing task id")

    if on_event:
        on_event({"event": "progress", "progress": 5, "message": "task created"})

    get_url = _join(cfg.base_url, cfg.get_path.format(id=task_id))
    start = time.time()
    progress = 5
    while time.time() - start < timeout_s:
        time.sleep(1.0)
        rr = sess.get(get_url, headers=headers, timeout=30)
        rr.raise_for_status()
        s = rr.json()
        status = s.get("status") or (s.get("data") or {}).get("status") or "unknown"
        video_url = s.get("video_url") or (s.get("data") or {}).get("video_url") or (s.get("result") or {}).get("url")
        if video_url:
            cost = float((s.get("usage") or {}).get("cost") or (20.0 if model_type == "seedance2.0" else 8.0))
            if on_event:
                on_event({"event": "cost", "amount": cost, "currency": "CNY"})
                on_event({"event": "result", "video_url": video_url})
            return SeedanceResult(video_url=video_url, cost_yuan=cost)
        if str(status).lower() in ("failed", "error"):
            raise RuntimeError(f"task failed status={status}")
        progress = min(95, progress + 1)
        if on_event:
            on_event({"event": "progress", "progress": progress, "message": f"status={status}"})

    raise RuntimeError("poll timeout")

