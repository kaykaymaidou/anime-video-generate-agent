from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests


ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


@dataclass
class ArkConfig:
    api_key: str
    base_url: str = ARK_BASE_URL


def build_chat_payload(*, model: str, system: str, user: str) -> Dict[str, Any]:
    # 兼容 Ark Chat/Responses 的常见 messages 格式
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }


def call_doubao_chat(
    *,
    cfg: ArkConfig,
    model: str,
    system: str,
    user: str,
    timeout_s: int = 60,
    session: Optional[requests.Session] = None,
) -> Dict[str, Any]:
    """
    豆包大模型调用（剧本医生/提示词优化）。
    测试中必须 mock requests，不允许真实出网消耗 token。
    """
    sess = session or requests.Session()
    url = cfg.base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg.api_key}",
        "Content-Type": "application/json",
    }
    payload = build_chat_payload(model=model, system=system, user=user)
    resp = sess.post(url, headers=headers, json=payload, timeout=timeout_s)
    resp.raise_for_status()
    return resp.json()


def get_default_config() -> ArkConfig:
    return ArkConfig(api_key=os.getenv("ARK_API_KEY", ""))

