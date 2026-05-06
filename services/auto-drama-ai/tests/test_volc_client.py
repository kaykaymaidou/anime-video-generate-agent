from volc_client import build_chat_payload, call_doubao_chat, ArkConfig


def test_build_chat_payload_shape():
    payload = build_chat_payload(model="doubao-lite", system="sys", user="usr")
    assert payload["model"] == "doubao-lite"
    assert isinstance(payload["messages"], list)
    assert payload["messages"][0]["role"] == "system"
    assert payload["messages"][1]["role"] == "user"


def test_call_doubao_chat_mocks_requests(mocker):
    sess = mocker.Mock()
    resp = mocker.Mock()
    resp.json.return_value = {"ok": True}
    resp.raise_for_status.return_value = None
    sess.post.return_value = resp

    out = call_doubao_chat(
        cfg=ArkConfig(api_key="k", base_url="https://ark.cn-beijing.volces.com/api/v3"),
        model="doubao-lite",
        system="sys",
        user="usr",
        session=sess,
    )
    assert out["ok"] is True
    args, kwargs = sess.post.call_args
    assert args[0].endswith("/chat/completions")
    assert kwargs["headers"]["Authorization"].startswith("Bearer ")

