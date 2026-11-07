from app.services.resolvers import _icon_candidates, _is_public_host


def test_icon_candidates_prefer_apple_touch_then_largest():
    html = """<head>
      <link rel="icon" href="/f16.png" sizes="16x16">
      <link rel="shortcut icon" href="/f64.png" sizes="64x64">
      <link rel='apple-touch-icon' sizes='180x180' href='/touch.png'>
      <link rel="mask-icon" href="/mask.svg">
      <meta property="og:image" content="https://cdn.example.com/banner.jpg">
    </head>"""
    got = _icon_candidates(html, "https://www.irctc.co.in/")
    assert got[:3] == ["https://www.irctc.co.in/touch.png", "https://www.irctc.co.in/f64.png", "https://www.irctc.co.in/f16.png"]
    assert got[-1] == "https://www.irctc.co.in/favicon.ico"
    assert "https://cdn.example.com/banner.jpg" in got
    assert not any(u.endswith(".svg") for u in got)


def test_private_hosts_are_never_fetched():
    for host in ("localhost", "127.0.0.1", "169.254.169.254", "10.0.0.5", "192.168.0.6"):
        assert not _is_public_host(host)
