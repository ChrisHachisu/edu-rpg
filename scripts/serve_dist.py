#!/usr/bin/env python3
"""Serve dist/ for local preview AND for a phone on the same Wi-Fi.

Why this exists rather than `npx serve`: the Act 1 high-fidelity runtime pulls ~19 MB of chunk
art through an iframe, and its adapter gives up after 30 s with "Act 1 runtime load timed out".
That was read as a boot bug for a while. It is not -- `npx serve` was dying mid-load, so the
iframe's requests failed and the adapter simply waited out its timeout. A single-threaded
server has the same effect for a different reason: it serialises those chunk requests behind
each other until the poll expires.

So: ThreadingHTTPServer (chunks load in parallel), bound to 0.0.0.0 so an iPhone on the same
network can reach it, no caching (so a reload always picks up an edited file), and the LAN URL
printed on startup.

    serve_dist.py [--port 5174] [--dir dist]
"""
from __future__ import annotations

import argparse
import functools
import http.server
import socket
import socketserver


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript",
        ".json": "application/json", ".wasm": "application/wasm",
        ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
        ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
    }

    def end_headers(self):
        # always revalidate: an edited dq-tiles.js or material must show up on a plain reload,
        # including on a phone, which caches far more aggressively than a desktop browser
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):      # keep the console readable; errors still surface
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))          # no packets sent; just picks the outbound interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5174)
    ap.add_argument("--dir", default="dist")
    args = ap.parse_args()

    handler = functools.partial(Handler, directory=args.dir)
    with Server(("0.0.0.0", args.port), handler) as httpd:
        print(f"serving {args.dir}/ (threaded, no-store)")
        print(f"  this machine : http://localhost:{args.port}")
        print(f"  iPhone / LAN : http://{lan_ip()}:{args.port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
