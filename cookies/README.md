# Optional YouTube Cookies Directory

If YouTube requires bot confirmation for requests originating from cloud/datacenter IP addresses (such as AWS EC2), you can place an exported `cookies.txt` file here:

`cookies/cookies.txt`

### How to export cookies:
1. Use an extension like **"Get cookies.txt LOCALLY"** (Chrome/Firefox).
2. Log into YouTube in your browser.
3. Export cookies for `youtube.com` into Netscape HTTP Cookie format.
4. Save the file as `cookies/cookies.txt`.
5. Restart or redeploy the server (`docker compose restart server`).

The server will automatically detect and pass this file to `yt-dlp`.
