from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from volcenginesdkarkruntime import Ark


def _load_env():
    pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    load_dotenv(os.path.join(pkg_root, ".env"))


def _env_first(*keys: str) -> str:
    for k in keys:
        v = os.getenv(k, "")
        if (v or "").strip():
            return v.strip()
    return ""


def _pretty(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)


def _as_dict(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool, list, dict)):
        return obj
    d = getattr(obj, "__dict__", None)
    if isinstance(d, dict) and d:
        return {k: _as_dict(v) for k, v in d.items() if not k.startswith("_")}
    return str(obj)


def _dig_first_url(x: Any) -> Optional[str]:
    """
    Ark SDK 不同版本/不同任务类型的返回结构可能不同。
    尝试从常见字段路径里找到第一个可用的 URL。
    """
    if x is None:
        return None
    if isinstance(x, str):
        return x if x.startswith("http") else None
    if isinstance(x, dict):
        # 常见字段名
        for k in ("video_url", "url", "download_url"):
            v = x.get(k)
            if isinstance(v, str) and v.startswith("http"):
                return v
        # 递归搜索
        for v in x.values():
            u = _dig_first_url(v)
            if u:
                return u
        return None
    if isinstance(x, list):
        for it in x:
            u = _dig_first_url(it)
            if u:
                return u
        return None
    # 对象：尝试 __dict__
    return _dig_first_url(_as_dict(x))


def main():
    _load_env()

    api_key = _env_first("ARK_API_KEY", "SEEDANCE_API_KEY")
    if not api_key:
        raise SystemExit("Missing ARK_API_KEY (or SEEDANCE_API_KEY). Set it in services/auto-drama-ai/.env")

    model = _env_first("VOLC_SEEDANCE_PRO_MODEL", "SEEDANCE_MODEL", "ARK_SEEDANCE_MODEL")
    if not model:
        # 官网示例的模型名（如果你用的是 endpoint id，建议放到 VOLC_SEEDANCE_PRO_MODEL）
        model = "doubao-seedance-1-5-pro-251215"

    client = Ark(api_key=api_key)

    # 最小可验证 payload：纯文本也能创建任务；带参考图/视频/音频可按需打开
    content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": "第一人称视角，手持镜头，制作一杯苹果果茶的广告短片，节奏轻快，8秒左右。",
        }
    ]

    # 通过环境变量切换是否使用官方示例素材（默认不开，避免依赖外部资源）
    use_demo_assets = (_env_first("SMOKE_USE_DEMO_ASSETS") or "0") in ("1", "true", "True")
    if use_demo_assets:
        content.extend(
            [
                {
                    "role": "reference_image",
                    "type": "image_url",
                    "image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg"},
                },
                {
                    "role": "reference_image",
                    "type": "image_url",
                    "image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg"},
                },
                {
                    "role": "reference_video",
                    "type": "video_url",
                    "video_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4"},
                },
                {
                    "role": "reference_audio",
                    "type": "audio_url",
                    "audio_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3"},
                },
            ]
        )

    duration = int(_env_first("SMOKE_DURATION") or "8")
    ratio = _env_first("SMOKE_RATIO") or "16:9"
    generate_audio = (_env_first("SMOKE_GENERATE_AUDIO") or "1") in ("1", "true", "True")

    print("----- create request -----")
    print(f"model={model}")
    print(f"duration={duration} ratio={ratio} generate_audio={generate_audio}")

    # SDK 字段名与 curl 保持一致：duration/ratio/generate_audio
    resp = client.content_generation.tasks.create(
        model=model,
        content=content,
        duration=duration,
        ratio=ratio,
        generate_audio=generate_audio,
    )
    print("----- create response -----")
    # resp 可能是对象，也可能是 dict；统一打印
    try:
        rid = getattr(resp, "id", None) or resp.get("id")  # type: ignore[attr-defined]
    except Exception:
        rid = getattr(resp, "id", None)
    print(_pretty(resp if isinstance(resp, dict) else getattr(resp, "__dict__", str(resp))))

    if not rid:
        raise SystemExit("Create succeeded but no task id returned; see response above")

    timeout_s = int(_env_first("SMOKE_TIMEOUT_S") or "240")
    started = time.time()
    last_status: Optional[str] = None
    last_cur: Any = None
    last_poll_ts = 0.0

    print("----- poll task -----")
    while time.time() - started < timeout_s:
        cur = client.content_generation.tasks.get(task_id=rid)
        last_cur = cur
        try:
            status = (getattr(cur, "status", None) or "").lower()
        except Exception:
            status = ""

        if status and status != last_status:
            last_status = status
            print(f"[status] {status}")
        # 防止“完全没输出”让人误判卡死：每 10s 打一次心跳
        now = time.time()
        if now - last_poll_ts >= 10.0:
            last_poll_ts = now
            elapsed = int(now - started)
            print(f"[poll] t={elapsed}s status={status or 'unknown'}")

        # 成功路径：不同 SDK/任务类型字段不一致，做兼容提取
        if status == "succeeded":
            url = None
            result = getattr(cur, "result", None)
            if result is not None:
                url = getattr(result, "url", None)
            if not url:
                url = _dig_first_url(cur)

            if url:
                print("----- done -----")
                print(f"video_url={url}")
                return

            # succeeded 但提取不到 url：把完整结构打印出来便于定位字段
            print("----- succeeded but no url found -----")
            print(_pretty(_as_dict(cur)))
            raise SystemExit(3)

        # 失败路径：尝试打印错误信息字段（不同版本字段名可能不同）
        err = getattr(cur, "error", None) or getattr(cur, "message", None) or getattr(cur, "err_msg", None)
        if status in ("failed", "error") and err:
            print("----- failed -----")
            print(_pretty(err))
            raise SystemExit(2)

        time.sleep(2.0)

    print("----- timeout -----")
    print(f"Timeout after {timeout_s}s polling task {rid}")
    if last_cur is not None:
        print("----- last get() response -----")
        print(_pretty(_as_dict(last_cur)))
    raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        raise
