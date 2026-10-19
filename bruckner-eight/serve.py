#!/usr/bin/env python3
"""
Simple HTTP server with full HTTP 206 Range Request support.
Essential for HTML5 audio/video seeking in Safari, Chrome, and Edge.
Usage:
    python3 serve.py [port] (default: 8080)
"""
import sys, os, re, http.server, socketserver

class RangeFileWrapper:
    def __init__(self, file_obj, length):
        self.file_obj = file_obj
        self.remaining = length

    def read(self, size=-1):
        if self.remaining <= 0:
            return b""
        if size < 0 or size > self.remaining:
            size = self.remaining
        data = self.file_obj.read(size)
        self.remaining -= len(data)
        return data

    def close(self):
        self.file_obj.close()


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        if "Range" not in self.headers:
            return super().send_head()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        file_size = os.path.getsize(path)
        range_header = self.headers["Range"]
        m = re.match(r"^bytes=(\d+)-(\d*)$", range_header.strip())
        if not m:
            return super().send_head()

        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else file_size - 1

        if start >= file_size or end >= file_size or start > end:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(length))
        self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

        f = open(path, "rb")
        f.seek(start)
        return RangeFileWrapper(f, length)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), RangeHTTPRequestHandler) as httpd:
        print(f"🎵 Bruckner 8 Server running at http://localhost:{port}/ (HTTP 206 Range Enabled)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    main()
