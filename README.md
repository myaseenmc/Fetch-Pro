
# M3U8 Downloader

A lightweight and powerful browser-based **M3U8/HLS video downloader** built using JavaScript.

This project allows users to:

- Parse `.m3u8` playlists
- Download HLS video streams
- Decrypt AES-128 encrypted segments
- Merge `.ts` chunks into playable media
- Export videos directly from the browser
- Resume interrupted downloads
- Track download progress in real time

Designed as a fully client-side downloader, the application works without requiring a backend server.

---

# ✨ Features

## 🎥 M3U8 Playlist Parsing

- Supports standard HLS `.m3u8` playlists
- Automatically parses:
  - Media playlists
  - Variant playlists
  - Nested playlists
- Detects available video resolutions and stream qualities

---

## 📥 Segment Downloading

Downloads all `.ts` video segments from the playlist.

### Includes:

- Parallel chunk downloading
- Retry mechanism for failed segments
- Sequential merge ordering
- Real-time progress tracking
- Pause/resume capability

---

## 🔓 AES-128 Decryption

Supports encrypted HLS streams.

### Supported:

- AES-128 decryption
- Key fetching from remote URLs
- Automatic segment decryption in browser
- Secure processing without external tools

Uses the included:

```text
aes-decryptor.js
````

for browser-side decryption.

---

## 🎞 MP4 Conversion

The downloader can merge transport stream files into playable video formats.

### Supported Output:

* `.ts`
* `.mp4`

Uses:

```text
mux-mp4.js
```

for media remuxing.

---

## 💾 Stream Saving

Integrated large-file saving support using:

```text
StreamSaver.js
```

### Benefits:

* Saves huge videos directly to disk
* Reduces browser memory usage
* Supports long recordings
* Better handling for large HLS streams

---

## 📊 Real-Time Download Progress

Displays detailed statistics while downloading:

* Current segment
* Download percentage
* Download speed
* Total segments
* Completed segments
* Estimated progress

---

## 🔄 Retry & Resume Support

Robust recovery system for unstable networks.

### Includes:

* Automatic retries on failed downloads
* Resume interrupted sessions
* Chunk validation
* Network error handling

---

## 🌐 Browser-Based Interface

Runs entirely in the browser.

# 🛠 Tech Stack

| Technology       | Purpose           |
| ---------------- | ----------------- |
| JavaScript       | Core logic        |
| Vue.js           | UI rendering      |
| StreamSaver.js   | Large file saving |
| Mux.js / mux-mp4 | MP4 remuxing      |
| Service Workers  | Streaming support |
| AES Decryptor    | HLS decryption    |

---

# 📁 Project Structure

```text
m3u8-downloader/
│
├── index.html                 # Main UI
├── index-en.html              # English UI
├── vue.js                     # Frontend framework
├── aes-decryptor.js           # AES-128 decryption
├── mux-mp4.js                 # MP4 remuxing
├── StreamSaver.js             # File saving utility
├── serviceWorker.js           # Browser streaming support
├── mitm.html                  # Stream handling helper
├── m3u8-downloader.user.js    # Userscript integration
│
├── imgs/                      # Screenshots and assets
│
├── README.md
└── README-EN.md
```

---

# 🧪 Supported Stream Types

| Stream Type           | Support |
| --------------------- | ------- |
| Standard HLS          | ✅       |
| Variant M3U8          | ✅       |
| AES-128 Encrypted     | ✅       |
| Live Streams          | Partial |
| DRM Protected Streams | ❌       |

---

# 🖥 Browser Compatibility

| Browser | Supported |
| ------- | --------- |
| Chrome  | ✅         |
| Edge    | ✅         |
| Firefox | ✅         |
| Brave   | ✅         |
| Opera   | ✅         |

---

# 🔐 Security & Privacy

Everything runs locally in your browser.

### No:

* Server uploads
* Cloud processing
* External storage
* User tracking

All video processing happens client-side.

---

# 💡 Use Cases

* Download online course videos
* Save livestream archives
* Backup HLS streams
* Offline video viewing
* Educational media archiving
* Testing HLS infrastructure

---

# ⚠️ Limitations

This downloader does NOT bypass:

* DRM systems
* Widevine protection
* FairPlay encryption
* PlayReady DRM

Only standard HLS streams are supported.

---

# 👨‍💻 Author

Created by Yaseen

GitHub:
[https://github.com/myaseenmc](https://github.com/myaseenmc)

---

# 📄 License
```text
MIT License
```

---

# 🙌 Acknowledgements

Inspired by the HLS streaming ecosystem and browser-based media tooling.

Special thanks to:

* Vue.js
* StreamSaver.js
* mux.js
* Open-source HLS community

::contentReference[oaicite:1]{index=1}
```
