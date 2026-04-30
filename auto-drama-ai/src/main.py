from __future__ import annotations

import json
import sys
from typing import Any, Dict

from seedance_client import create_and_poll, get_default_config


def emit(obj: Dict[str, Any]):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    raw = sys.stdin.read()
    task = json.loads(raw)
    shot_id = task.get("shotId") or task.get("id") or "shot"

    cfg = get_default_config()
    if not cfg.api_key:
        emit({"event": "log", "shotId": shot_id, "message": "WARN: SEEDANCE_API_KEY missing (tests/mock only)"})

    def on_event(e: Dict[str, Any]):
        e.setdefault("shotId", shot_id)
        emit(e)

    create_and_poll(
        cfg=cfg,
        prompt=task.get("prompt") or "",
        model_type=task.get("modelType") or "seedance2.0",
        img_urls=task.get("img_urls") or [],
        frame_image_url=task.get("frame_image_url"),
        on_event=on_event,
    )

    emit({"event": "done", "shotId": shot_id})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit({"event": "error", "message": str(e)})
        raise

