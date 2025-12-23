"""
Dropbox OAuth2 Authorization Script
Run this once to get refresh token
"""
import http.server
import socketserver
import urllib.parse
import webbrowser
import httpx
import sys

# Dropbox App credentials
APP_KEY = "83u2bv9g2qwfqq5"
APP_SECRET = "7mtvew8y2kllmf9"
REDIRECT_URI = "http://localhost:8080/callback"

authorization_code = None


class OAuthHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global authorization_code

        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/callback":
            query = urllib.parse.parse_qs(parsed.query)
            if "code" in query:
                authorization_code = query["code"][0]
                self.send_response(200)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"""
                <html>
                <body style="font-family: Arial; text-align: center; padding-top: 50px;">
                <h1>Authorization successful!</h1>
                <p>You can close this window.</p>
                </body>
                </html>
                """)
            else:
                self.send_response(400)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h1>Error: No code received</h1>")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress logs


def get_authorization_url():
    """Get Dropbox authorization URL"""
    params = {
        "client_id": APP_KEY,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "token_access_type": "offline",  # This gives us refresh token
    }
    return f"https://www.dropbox.com/oauth2/authorize?{urllib.parse.urlencode(params)}"


def exchange_code_for_tokens(code: str):
    """Exchange authorization code for access and refresh tokens"""
    with httpx.Client() as client:
        response = client.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": REDIRECT_URI,
                "client_id": APP_KEY,
                "client_secret": APP_SECRET,
            }
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            return None


def main():
    global authorization_code

    print("=" * 50)
    print("Dropbox OAuth2 Authorization")
    print("=" * 50)

    # Start local server
    PORT = 8080
    with socketserver.TCPServer(("", PORT), OAuthHandler) as httpd:
        print(f"\n1. Local server started on port {PORT}")

        # Open browser with authorization URL
        auth_url = get_authorization_url()
        print(f"\n2. Opening browser for authorization...")
        print(f"   If browser doesn't open, visit:\n   {auth_url}")

        webbrowser.open(auth_url)

        print(f"\n3. Waiting for authorization...")

        # Wait for callback
        while authorization_code is None:
            httpd.handle_request()

        print(f"\n4. Authorization code received!")

    # Exchange code for tokens
    print(f"\n5. Exchanging code for tokens...")
    tokens = exchange_code_for_tokens(authorization_code)

    if tokens:
        print("\n" + "=" * 50)
        print("SUCCESS! Add these to your .env file:")
        print("=" * 50)
        print(f"\nDROPBOX_APP_KEY={APP_KEY}")
        print(f"DROPBOX_APP_SECRET={APP_SECRET}")
        print(f"DROPBOX_REFRESH_TOKEN={tokens.get('refresh_token')}")
        print(f"\n# Current access token (expires in {tokens.get('expires_in')} seconds):")
        print(f"# DROPBOX_ACCESS_TOKEN={tokens.get('access_token')}")
        print("\n" + "=" * 50)

        # Save to file
        with open("dropbox_tokens.txt", "w") as f:
            f.write(f"DROPBOX_APP_KEY={APP_KEY}\n")
            f.write(f"DROPBOX_APP_SECRET={APP_SECRET}\n")
            f.write(f"DROPBOX_REFRESH_TOKEN={tokens.get('refresh_token')}\n")

        print("\nTokens also saved to dropbox_tokens.txt")
    else:
        print("\nFailed to get tokens!")
        sys.exit(1)


if __name__ == "__main__":
    main()
