from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv

_pkg_root = Path(__file__).resolve().parent.parent
load_dotenv(_pkg_root / ".env")

from seedance_client_sdk import build_create_body_from_worker_task, create_and_poll, get_default_config
from seedance_client_sdk import strip_surrogates


def emit(obj: Dict[str, Any]):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    raw = sys.stdin.read()
    task = json.loads(raw)
    shot_id = task.get("shotId") or task.get("id") or "shot"
    task_id = task.get("taskId") or task.get("task_id")

    cfg = get_default_config()
    emit({"event": "log", "shotId": shot_id, "taskId": task_id, "message": "python worker start"})

    # 本地调试模式：不调用火山，直接模拟进度/结果，验证 Next⇄Python⇄前端 事件链路
    if str(os.getenv("AUTO_DRAMA_FAKE", "")).strip().lower() in ("1", "true", "yes", "on"):
        emit({"event": "log", "shotId": shot_id, "taskId": task_id, "message": "FAKE mode: bypass volcengine"})
        for p, msg in [(10, "queued"), (35, "python running"), (60, "simulating poll"), (95, "status: succeeded")]:
            emit({"event": "progress", "shotId": shot_id, "taskId": task_id, "progress": p, "message": msg})
            time.sleep(0.4)
        emit(
            {
                "event": "result",
                "shotId": shot_id,
                "taskId": task_id,
                "video_url": "https://example.com/fake.mp4",
            }
        )
        emit({"event": "done", "shotId": shot_id, "taskId": task_id})
        return
    if not (cfg.api_key or "").strip():
        emit({"event": "error", "shotId": shot_id, "taskId": task_id, "message": "SEEDANCE_API_KEY missing"})
        return
    if not (cfg.pro_model or "").strip():
        emit({"event": "error", "shotId": shot_id, "taskId": task_id, "message": "VOLC_SEEDANCE_PRO_MODEL missing"})
        return

    def on_event(e: Dict[str, Any]):
        e.setdefault("shotId", shot_id)
        if task_id:
            e.setdefault("taskId", task_id)
        emit(e)

    prompt_raw = task.get("prompt") or ""
    if strip_surrogates(str(prompt_raw)) != str(prompt_raw):
        emit(
            {
                "event": "log",
                "shotId": shot_id,
                "taskId": task_id,
                "message": f"prompt sanitized (removed invalid unicode), len {len(str(prompt_raw))}->{len(strip_surrogates(str(prompt_raw)))}",
            }
        )

    payload = build_create_body_from_worker_task(task)
    create_and_poll(cfg=cfg, create_body=payload, on_event=on_event)

    emit({"event": "done", "shotId": shot_id})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # 最少保证带上 shotId（如果 main() 里已解析到）
        try:
            emit({"event": "error", "message": str(e)})
        finally:
            raise
