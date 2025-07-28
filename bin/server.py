import http.server
import socketserver

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # These headers are required for SharedArrayBuffer
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    # Serve from the build directory
    httpd.directory = "build-web"
    print(f"Serving from '{httpd.directory}' at http://localhost:{PORT}")
    httpd.serve_forever()

