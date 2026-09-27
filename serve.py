#!/usr/bin/env python3
"""Local static server that mimics the production Worker's asset behavior:
clean URLs (/about -> about.html, /games/cmyk/play -> games/cmyk/play.html)
and no-cache headers so edits show up on every reload.

Usage: python serve.py [port]   (default 8792)
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        fs_path = super().translate_path(path)
        # Clean URL: prefer <path>.html like production's auto-trailing-slash,
        # even when a same-named directory exists (games.html vs games/ — the
        # games/ portal is assetsignored in production, so games.html wins).
        base = fs_path.rstrip("/")
        if not path.rstrip("/").endswith(".html") and os.path.isfile(base + ".html"):
            return base + ".html"
        return fs_path

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_POST(self):
        # Dev-only helper: POST /__save?name=<basename> writes the body into
        # assets/ (used to rasterize SVG covers to PNG via the browser canvas).
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path)
        if u.path != "/__save":
            self.send_error(404)
            return
        name = os.path.basename(parse_qs(u.query).get("name", [""])[0])
        if not name or not name.endswith(".png"):
            self.send_error(400)
            return
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        out = os.path.join(ROOT, "assets", name)
        with open(out, "wb") as f:
            f.write(data)
        body = f"saved {out} ({len(data)} bytes)".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error(self, code, message=None, explain=None):
        # Serve the custom 404 page like production's not_found_handling
        if code == 404:
            page = os.path.join(ROOT, "404.html")
            if os.path.isfile(page):
                body = open(page, "rb").read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                try:
                    self.wfile.write(body)
                except BrokenPipeError:
                    pass
                return
        super().send_error(code, message, explain)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8792
    with http.server.ThreadingHTTPServer(("", port), CleanURLHandler) as httpd:
        print(f"dev-serve on http://localhost:{port} (root: {ROOT})")
        httpd.serve_forever()
