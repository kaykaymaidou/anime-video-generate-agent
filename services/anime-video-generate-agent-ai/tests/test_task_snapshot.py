from types import SimpleNamespace

from seedance_client_sdk import task_to_snapshot


def test_task_to_snapshot_content_and_usage():
    usage = SimpleNamespace(completion_tokens=10, total_tokens=99, cost=1.23)
    content = SimpleNamespace(video_url="https://v.mp4", last_frame_url="https://f.jpg", file_url="")
    tool = SimpleNamespace(type="seedance")
    result = SimpleNamespace(
        id="cgt-1",
        model="m",
        status="succeeded",
        content=content,
        usage=usage,
        tools=[tool],
        error=None,
        created_at=1,
        updated_at=2,
    )
    snap = task_to_snapshot(result)
    assert snap["status"] == "succeeded"
    assert snap["ark_task_id"] == "cgt-1"
    assert snap["content"]["video_url"] == "https://v.mp4"
    assert snap["content"]["last_frame_url"] == "https://f.jpg"
    assert snap["usage"]["completion_tokens"] == 10
    assert snap["tool_usage"][0]["type"] == "seedance"
