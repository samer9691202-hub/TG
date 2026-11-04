#!/usr/bin/env python3
"""Tiny local web server for Vaulty (no dependencies).  Usage:  python3 serve.py [port]
Binds to 127.0.0.1 only. Open http://localhost:8080 afterwards."""
import http.server, os, sys, functools

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
root = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
Handler.extensions_map.update({'.webmanifest': 'application/manifest+json', '.js': 'text/javascript'})

with http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root)) as srv:
    print(f'Vaulty running at http://localhost:{port}  (Ctrl+C to stop)')
    try: srv.serve_forever()
    except KeyboardInterrupt: print('\nStopped.')
