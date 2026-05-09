"""
HTTP 网关：Next 可分步调用「创建任务」「查询任务」，与文档一致。
启动：见 package.json py:gateway（默认 http://127.0.0.1:8799）
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from volcenginesdkarkruntime import Ark

_pkg_root = Path(__file__).resolve().parent.parent
load_dotenv(_pkg_root / ".env")

from seedance_client_sdk import (  # noqa: E402
    build_create_body_from_worker_task,
    create_task,
    delete_task,
    get_default_config,
    get_task_status,
    task_to_snapshot,
)

app = FastAPI(title="anime-video-generate-agent-ai", version="0.1.0")

_cors = os.getenv("PY_GATEWAY_CORS", "*").strip()
if _cors == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[x.strip() for x in _cors.split(",") if x.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/tasks")
def create_volc_task(body: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    cfg = get_default_config()
    if not (cfg.api_key or "").strip():
        raise HTTPException(status_code=400, detail="SEEDANCE_API_KEY missing")
    if not (cfg.pro_model or "").strip():
        raise HTTPException(status_code=400, detail="VOLC_SEEDANCE_PRO_MODEL missing")

    payload = build_create_body_from_worker_task(body)
    client = Ark(base_url=cfg.base_url, api_key=cfg.api_key)
    try:
        ark_task_id = create_task(client=client, body=payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"ark_task_id": ark_task_id}


@app.get("/v1/tasks/{ark_task_id}")
def read_volc_task(ark_task_id: str) -> Dict[str, Any]:
    cfg = get_default_config()
    if not (cfg.api_key or "").strip():
        raise HTTPException(status_code=400, detail="SEEDANCE_API_KEY missing")
    client = Ark(base_url=cfg.base_url, api_key=cfg.api_key)
    try:
        raw = get_task_status(client=client, task_id=ark_task_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return task_to_snapshot(raw)


@app.delete("/v1/tasks/{ark_task_id}")
def remove_volc_task(ark_task_id: str) -> Dict[str, Any]:
    cfg = get_default_config()
    if not (cfg.api_key or "").strip():
        raise HTTPException(status_code=400, detail="SEEDANCE_API_KEY missing")
    client = Ark(base_url=cfg.base_url, api_key=cfg.api_key)
    try:
        delete_task(client=client, task_id=ark_task_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"ok": True, "ark_task_id": ark_task_id}


def main():
    import uvicorn

    host = os.getenv("PY_GATEWAY_HOST", "127.0.0.1")
    port = int(os.getenv("PY_GATEWAY_PORT", "8799"))
    uvicorn.run(app, host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
