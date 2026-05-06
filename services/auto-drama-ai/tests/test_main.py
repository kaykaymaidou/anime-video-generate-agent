import json


def test_main_emits_done(monkeypatch, capsys):
    # 延迟 import，避免在模块级执行时读取 stdin
    import main as entry

    # mock stdin 输入
    monkeypatch.setattr(entry.sys, "stdin", type("S", (), {"read": lambda self=None: json.dumps({"shotId": "s1", "prompt": "p"})})())

    # mock create_and_poll（不出网）
    def fake_create_and_poll(*args, **kwargs):
        kwargs["on_event"]({"event": "result", "video_url": "http://x.mp4"})
        return None

    monkeypatch.setattr(entry, "create_and_poll", fake_create_and_poll)

    entry.main()
    out = capsys.readouterr().out.strip().splitlines()
    assert any("\"event\": \"done\"" in line for line in out)

