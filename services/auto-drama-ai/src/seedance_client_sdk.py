"""
Seedance API 客户端
对接火山方舟内容生成 / 视频生成任务

- 创建任务: https://www.volcengine.com/docs/82379/1520757?lang=zh
- 取消/删除任务: https://www.volcengine.com/docs/82379/1521720?lang=zh
  DELETE {base}/contents/generations/tasks/{id}
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Callable

from volcenginesdkarkruntime import Ark


def strip_surrogates(s: str) -> str:
    """
    httpx/json 在 UTF-8 编码时不允许 surrogate（如 \\udcad）字符。
    这些字符通常来自跨语言/跨平台拼接文本时的“半个 emoji”等异常编码。
    这里做兜底清洗：移除所有 surrogate codepoints，避免整个链路在发起请求前崩溃。
    """
    try:
        return s.encode("utf-16", "surrogatepass").decode("utf-16", "ignore")
    except Exception:
        # 最差兜底：过滤掉 surrogate 区间
        return "".join(ch for ch in s if not (0xD800 <= ord(ch) <= 0xDFFF))


def _as_plain_dict(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool, list, dict)):
        return obj
    d = getattr(obj, "__dict__", None)
    if isinstance(d, dict) and d:
        return {k: _as_plain_dict(v) for k, v in d.items() if not str(k).startswith("_")}
    return str(obj)


def _dig_video_url(x: Any) -> Optional[str]:
    """从 Ark get task 响应里尽量找出视频 URL（不同 SDK 版本字段可能不同）。"""
    if x is None:
        return None
    if isinstance(x, str) and x.startswith("http"):
        return x
    if isinstance(x, dict):
        for k in ("video_url", "url", "download_url"):
            v = x.get(k)
            if isinstance(v, str) and v.startswith("http"):
                return v
        for v in x.values():
            u = _dig_video_url(v)
            if u:
                return u
        return None
    if isinstance(x, list):
        for it in x:
            u = _dig_video_url(it)
            if u:
                return u
        return None
    return _dig_video_url(_as_plain_dict(x))


# 预估 Token 消耗（根据提示词长度和视频时长估算）
def estimate_tokens(prompt: str, duration: int) -> int:
    """
    预估 Token 消耗
    
    估算规则：
    - 提示词：约 1.5 tokens / 字符（中英文混合）
    - 视频生成：约 1000 tokens / 秒
    """
    prompt_tokens = int(len(prompt) * 1.5)
    video_tokens = duration * 1000
    return prompt_tokens + video_tokens


@dataclass
class SeedanceConfig:
    """Seedance 配置"""
    api_key: str
    base_url: str
    create_path: str
    get_path: str
    cancel_path: str
    pro_model: str
    fast_model: str
    lite_model: str


def get_default_config() -> SeedanceConfig:
    """从环境变量获取默认配置"""
    return SeedanceConfig(
        api_key=os.getenv("SEEDANCE_API_KEY", ""),
        base_url=os.getenv("VOLC_ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
        create_path=os.getenv("VOLC_VIDEO_CREATE_PATH", "/contents/generations/tasks"),
        get_path=os.getenv("VOLC_VIDEO_GET_PATH", "/contents/generations/tasks/{id}"),
        cancel_path=os.getenv("VOLC_VIDEO_CANCEL_PATH", "/contents/generations/tasks/{id}"),
        pro_model=os.getenv("VOLC_SEEDANCE_PRO_MODEL", "ep-20260505185732-ddcfz"),
        # 保留字段兼容，但当前不使用（仅 Seedance 1.5 Pro）
        fast_model=os.getenv("VOLC_SEEDANCE_FAST_MODEL", ""),
        lite_model=os.getenv("VOLC_SEEDANCE_LITE_MODEL", ""),
    )


def validate_params(*, resolution: str, duration: int, model_type: str):
    """验证参数"""
    if model_type not in ("seedance1.5pro",):
        raise ValueError("model_type must be seedance1.5pro")
    if duration < 2 or duration > 12:
        raise ValueError("duration must be 2..12 seconds")
    if resolution not in ("1080p", "720p", "480p"):
        raise ValueError("resolution must be 1080p/720p/480p")


def build_content(
    *,
    prompt: str,
    model_type: str,
    resolution: str = "720p",
    duration: int = 5,
    ratio: str = "16:9",
    fps: int = 24,
    seed: int = -1,
    watermark: bool = False,
    camera_fixed: bool = False,
    img_urls: Optional[List[str]] = None,
    first_frame_url: Optional[str] = None,
    last_frame_url: Optional[str] = None,
    reference_image_urls: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    构建「创建任务」POST /contents/generations/tasks 的请求体（与官方文档一致）。

    - content[].text 仅放纯文本提示词，不把缩写参数拼进 text（文档要求完整字段名）。
    - resolution / ratio / duration / seed / camera_fixed 等放在请求体顶层。
    """
    validate_params(resolution=resolution, duration=duration, model_type=model_type)

    model = get_default_config().pro_model
    content: List[Dict[str, Any]] = []

    text_prompt = strip_surrogates(prompt or "")
    content.append({"type": "text", "text": text_prompt})

    if first_frame_url:
        content.append(
            {"type": "image_url", "image_url": {"url": first_frame_url}, "role": "first_frame"}
        )

    if last_frame_url:
        content.append(
            {"type": "image_url", "image_url": {"url": last_frame_url}, "role": "last_frame"}
        )

    if reference_image_urls:
        for url in reference_image_urls[:4]:
            content.append(
                {"type": "image_url", "image_url": {"url": url}, "role": "reference_image"}
            )
    elif img_urls and not first_frame_url:
        for url in img_urls[:1]:
            content.append(
                {"type": "image_url", "image_url": {"url": url}, "role": "first_frame"}
            )

    body: Dict[str, Any] = {
        "model": model,
        "content": content,
        "resolution": resolution,
        "ratio": ratio,
        "duration": duration,
        "camera_fixed": bool(camera_fixed),
    }

    if seed >= 0:
        body["seed"] = int(seed)

    cb = os.getenv("VOLC_SEEDANCE_CALLBACK_URL", "").strip()
    if cb:
        body["callback_url"] = cb

    wm_env = os.getenv("VOLC_SEEDANCE_WATERMARK", "").strip().lower()
    if wm_env in ("1", "true", "yes"):
        body["watermark"] = True
    elif wm_env in ("0", "false", "no"):
        body["watermark"] = False
    elif watermark:
        body["watermark"] = True

    ga = os.getenv("VOLC_SEEDANCE_GENERATE_AUDIO", "").strip().lower()
    if ga in ("1", "true", "yes"):
        body["generate_audio"] = True
    elif ga in ("0", "false", "no"):
        body["generate_audio"] = False

    rl = os.getenv("VOLC_SEEDANCE_RETURN_LAST_FRAME", "").strip().lower()
    if rl in ("1", "true", "yes"):
        body["return_last_frame"] = True

    fps_env = os.getenv("VOLC_SEEDANCE_FPS", "").strip()
    if fps_env:
        body["fps"] = int(fps_env)
    elif fps and fps > 0:
        body["fps"] = int(fps)

    return body


def build_create_body_from_worker_task(task: Dict[str, Any]) -> Dict[str, Any]:
    """将 Node stdin / HTTP body 转为 Ark「创建任务」请求体（与 build_content 一致）。"""
    reference_image_urls = task.get("reference_image_urls")
    img_urls = task.get("img_urls") or []
    if reference_image_urls is None and img_urls:
        reference_image_urls = img_urls

    duration = int(task.get("duration") or 5)
    resolution = str(task.get("resolution") or "720p").lower()
    ratio = str(task.get("ratio") or "16:9")
    fps = int(task.get("fps") or 24)
    seed_raw = task.get("seed")
    seed = int(seed_raw) if seed_raw is not None and str(seed_raw).strip() != "" else -1

    prompt_raw = task.get("prompt") or ""
    prompt = strip_surrogates(str(prompt_raw))

    return build_content(
        prompt=prompt,
        model_type=task.get("modelType") or "seedance1.5pro",
        duration=duration,
        resolution=resolution,
        ratio=ratio,
        fps=fps,
        seed=seed,
        watermark=bool(task.get("watermark") or False),
        camera_fixed=bool(task.get("camera_fixed") or False),
        first_frame_url=task.get("first_frame_url"),
        last_frame_url=task.get("last_frame_url") or task.get("frame_image_url"),
        reference_image_urls=reference_image_urls,
        img_urls=img_urls,
    )


@dataclass
class SeedanceResult:
    """视频生成结果"""
    video_url: str
    task_id: str
    cost_yuan: float
    last_frame_url: Optional[str] = None


def _join(base: str, p: str) -> str:
    """拼接 URL"""
    return base.rstrip("/") + "/" + p.lstrip("/")


def create_task(*, client: Ark, body: Dict[str, Any]) -> str:
    """
    POST /contents/generations/tasks
    body 需包含 model、content，以及文档要求的顶层参数（resolution、ratio、duration 等）。
    """
    kwargs = {k: v for k, v in body.items() if v is not None}
    result = client.content_generation.tasks.create(**kwargs)
    return result.id


def get_task_status(
    *,
    client: Ark,
    task_id: str,
) -> Any:
    """GET /contents/generations/tasks/{id}，查询任务状态与结果（SDK 模型对象）。"""
    result = client.content_generation.tasks.get(task_id=task_id)
    return result


def _usage_to_dict(usage: Any) -> Dict[str, Any]:
    """usage：completion_tokens / total_tokens / cost / tool_usagenew 等（以接口返回为准）。"""
    if usage is None:
        return {}
    out: Dict[str, Any] = {}
    if hasattr(usage, "model_dump"):
        try:
            dumped = usage.model_dump()
            if isinstance(dumped, dict):
                out.update({k: v for k, v in dumped.items() if v is not None})
        except Exception:
            pass
    for key in (
        "completion_tokens",
        "total_tokens",
        "prompt_tokens",
        "cost",
        "tool_usagenew",
        "tool_usage",
    ):
        if hasattr(usage, key):
            v = getattr(usage, key, None)
            if v is not None:
                out[key] = v
    if isinstance(usage, dict):
        out.update({k: v for k, v in usage.items() if v is not None})
    return out


def _tools_to_list(tools: Any) -> List[Dict[str, Any]]:
    if not tools:
        return []
    out: List[Dict[str, Any]] = []
    for t in tools:
        if hasattr(t, "model_dump"):
            try:
                out.append(t.model_dump())
                continue
            except Exception:
                pass
        if isinstance(t, dict):
            out.append(t)
        else:
            out.append({"type": getattr(t, "type", None)})
    return out


def task_to_snapshot(result: Any) -> Dict[str, Any]:
    """
    将「查询视频生成任务」响应整理为 Next 可用的 JSON。
    文档字段：status、content（video_url / last_frame_url）、usage、tools 等。
    """
    status = getattr(result, "status", None) or ""
    ark_id = getattr(result, "id", None)

    content_obj = getattr(result, "content", None)
    video_url = ""
    last_frame_url = ""
    file_url = ""
    if content_obj is not None:
        video_url = (getattr(content_obj, "video_url", None) or "").strip()
        last_frame_url = (getattr(content_obj, "last_frame_url", None) or "").strip()
        file_url = (getattr(content_obj, "file_url", None) or "").strip()
    top_last = getattr(result, "last_frame_url", None)
    if not last_frame_url and top_last:
        last_frame_url = str(top_last).strip()
    if not video_url:
        dug = _dig_video_url(result)
        if dug:
            video_url = dug

    usage = _usage_to_dict(getattr(result, "usage", None))
    tool_usage = _tools_to_list(getattr(result, "tools", None))

    err = getattr(result, "error", None)
    error_out: Optional[Dict[str, Any]] = None
    if err is not None:
        msg = getattr(err, "message", None)
        code = getattr(err, "code", None)
        if msg is not None or code is not None:
            error_out = {"message": msg, "code": code}
        elif isinstance(err, dict):
            error_out = dict(err)
        else:
            error_out = {"message": str(err)}

    return {
        "status": status,
        "ark_task_id": ark_id,
        "model": getattr(result, "model", None),
        "content": {
            "video_url": video_url,
            "last_frame_url": last_frame_url,
            "file_url": file_url,
        },
        "usage": usage,
        "tool_usage": tool_usage,
        "error": error_out,
        "created_at": getattr(result, "created_at", None),
        "updated_at": getattr(result, "updated_at", None),
    }


def delete_task(
    *,
    client: Ark,
    task_id: str,
) -> None:
    """
    DELETE /contents/generations/tasks/{id}
    取消或删除视频生成任务（以官方文档为准: 1521720）。
    """
    client.content_generation.tasks.delete(task_id)


def delete_task_with_config(*, cfg: SeedanceConfig, task_id: str) -> None:
    """使用默认配置构建 Ark 客户端后删除任务。"""
    client = Ark(base_url=cfg.base_url, api_key=cfg.api_key)
    delete_task(client=client, task_id=task_id)


def poll_task(
    *,
    client: Ark,
    task_id: str,
    timeout_s: int = 600,
    on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> SeedanceResult:
    """
    轮询任务直到完成
    
    Args:
        client: Ark 客户端
        task_id: 任务 ID
        timeout_s: 超时时间（秒）
        on_event: 进度回调函数
    
    Returns:
        SeedanceResult: 包含视频 URL 和成本
    """
    start = time.time()
    progress = 5
    
    if on_event:
        on_event({"event": "progress", "progress": progress, "message": "任务已创建，开始轮询"})
    
    while time.time() - start < timeout_s:
        time.sleep(2.0)  # 每2秒查询一次
        
        try:
            result = get_task_status(client=client, task_id=task_id)
        except Exception as e:
            if on_event:
                on_event({"event": "log", "message": f"查询任务状态失败: {e}"})
            continue
        
        snap = task_to_snapshot(result)
        status = (snap.get("status") or "").lower()

        video_url = (snap.get("content") or {}).get("video_url") or None
        last_frame_url = (snap.get("content") or {}).get("last_frame_url") or None
        usage_d = snap.get("usage") or {}
        cost = 0.0
        if isinstance(usage_d.get("cost"), (int, float)):
            cost = float(usage_d["cost"])
        elif hasattr(result, "usage") and result.usage and hasattr(result.usage, "cost"):
            cost = float(getattr(result.usage, "cost") or 0)

        if on_event:
            on_event(
                {
                    "event": "task_snapshot",
                    "ark_task_id": snap.get("ark_task_id"),
                    "status": snap.get("status"),
                    "content": snap.get("content"),
                    "usage": snap.get("usage"),
                    "tool_usage": snap.get("tool_usage"),
                    "error": snap.get("error"),
                }
            )

        if status == "succeeded":
            if video_url:
                if on_event:
                    on_event({"event": "progress", "progress": 100, "message": "视频生成完成"})
                    on_event({"event": "result", "video_url": video_url, "cost": cost})

                return SeedanceResult(
                    video_url=video_url,
                    task_id=task_id,
                    cost_yuan=cost,
                    last_frame_url=last_frame_url or None,
                )
            if on_event:
                on_event(
                    {
                        "event": "log",
                        "message": "状态为 succeeded 但未解析到视频 URL，继续轮询等待字段就绪",
                    }
                )
            time.sleep(1.0)
            continue
        
        if status == "failed":
            err = snap.get("error") or {}
            error_msg = (err.get("message") if isinstance(err, dict) else None) or "未知错误"
            raise RuntimeError(f"任务失败: {error_msg}")

        if status == "cancelled":
            raise RuntimeError("任务已取消")

        if status == "expired":
            raise RuntimeError("任务已过期")
        
        # 更新进度
        progress = min(95, progress + 2)
        if on_event:
            on_event({"event": "progress", "progress": progress, "message": f"状态: {status}"})
    
    raise RuntimeError("轮询超时")


def create_and_poll(
    *,
    cfg: SeedanceConfig,
    create_body: Optional[Dict[str, Any]] = None,
    prompt: str = "",
    model_type: str = "seedance1.5pro",
    duration: int = 5,
    resolution: str = "720p",
    ratio: str = "16:9",
    fps: int = 24,
    seed: int = -1,
    watermark: bool = False,
    camera_fixed: bool = False,
    img_urls: Optional[List[str]] = None,
    first_frame_url: Optional[str] = None,
    last_frame_url: Optional[str] = None,
    reference_image_urls: Optional[List[str]] = None,
    timeout_s: int = 600,
    on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> SeedanceResult:
    """
    创建任务并轮询直到完成
    
    这是旧版本的兼容函数，新代码建议使用 create_task + poll_task
    """
    # 初始化 Ark 客户端
    if on_event:
        on_event(
            {
                "event": "log",
                "message": f"init ark client base_url={cfg.base_url}",
            }
        )
    client = Ark(
        base_url=cfg.base_url,
        api_key=cfg.api_key,
    )

    env_to = os.getenv("SEEDANCE_POLL_TIMEOUT_S", "").strip()
    if env_to:
        timeout_s = int(env_to)

    if create_body is not None:
        payload = create_body
    else:
        payload = build_content(
            prompt=prompt,
            model_type=model_type,
            resolution=resolution,
            duration=duration,
            ratio=ratio,
            fps=fps,
            seed=seed,
            watermark=watermark,
            camera_fixed=camera_fixed,
            img_urls=img_urls,
            first_frame_url=first_frame_url,
            last_frame_url=last_frame_url,
            reference_image_urls=reference_image_urls,
        )

    task_id = create_task(client=client, body=payload)
    
    if on_event:
        on_event({"event": "log", "message": f"seedance task created task_id={task_id} model={payload['model']}"})
        on_event({"event": "progress", "progress": 5, "message": "任务已创建"})
    
    # 轮询任务
    return poll_task(
        client=client,
        task_id=task_id,
        timeout_s=timeout_s,
        on_event=on_event,
    )
