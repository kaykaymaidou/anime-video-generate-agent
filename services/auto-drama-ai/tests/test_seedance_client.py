import pytest

from seedance_client import build_create_payload, SeedanceConfig, create_and_poll


def test_seedance_build_payload_validation():
    cfg = SeedanceConfig(
        api_key="x",
        base_url="https://example.com",
        create_path="/videos",
        get_path="/videos/{id}",
        cancel_path="/videos/{id}",
        seedance2_model="Doubao-Seedance-2.0",
        seedance2_fast_model="Doubao-Seedance-2.0-Fast",
    )

    with pytest.raises(ValueError):
        build_create_payload(
            cfg=cfg,
            prompt="p",
            model_type="bad",
            resolution="1080P",
            duration=5,
            withsound=True,
        )

    with pytest.raises(ValueError):
        build_create_payload(
            cfg=cfg,
            prompt="p",
            model_type="seedance2.0",
            resolution="480P",
            duration=5,
            withsound=True,
        )

    body = build_create_payload(
        cfg=cfg,
        prompt="p",
        model_type="seedance2.0fast",
        resolution="720P",
        duration=5,
        withsound=True,
        img_urls=["http://x/1.jpg"],
        frame_image_url="http://x/last.jpg",
    )
    assert body["prompt"] == "p"
    assert body["img_urls"][0].startswith("http")
    assert body["frame_image_url"].endswith(".jpg")


def test_create_and_poll_happy_path(mocker):
    cfg = SeedanceConfig(
        api_key="k",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        create_path="/videos",
        get_path="/videos/{id}",
        cancel_path="/videos/{id}",
        seedance2_model="Doubao-Seedance-2.0",
        seedance2_fast_model="Doubao-Seedance-2.0-Fast",
    )

    sess = mocker.Mock()
    post_resp = mocker.Mock()
    post_resp.json.return_value = {"id": "task1"}
    post_resp.raise_for_status.return_value = None
    sess.post.return_value = post_resp

    get_resp = mocker.Mock()
    get_resp.json.return_value = {"status": "running"}
    get_resp.raise_for_status.return_value = None

    get_resp2 = mocker.Mock()
    get_resp2.json.return_value = {"status": "success", "video_url": "http://video.mp4", "usage": {"cost": 12.34}}
    get_resp2.raise_for_status.return_value = None

    sess.get.side_effect = [get_resp, get_resp2]

    events = []

    def on_event(e):
        events.append(e)

    res = create_and_poll(
        cfg=cfg,
        prompt="p",
        model_type="seedance2.0fast",
        img_urls=["http://img.jpg"],
        frame_image_url="http://last.jpg",
        session=sess,
        timeout_s=5,
        on_event=on_event,
    )
    assert res.video_url.endswith(".mp4")
    assert res.cost_yuan == 12.34
    assert any(e.get("event") == "result" for e in events)

