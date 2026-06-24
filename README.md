# FB Group Auto Publisher

> Chrome Extension (Manifest V3) to automatically publish content to your Facebook groups — personal profile or Facebook Page.

![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-blue?logo=googlechrome)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-1.0.0-orange)

---

## Overview

FB Group Auto Publisher is a Chrome extension that schedules and automatically sends posts to your Facebook groups using your existing browser session. It supports both your personal profile and your Facebook Pages.

**What it does:**
- Automatically publishes to your groups on a configurable schedule
- Randomly rotates up to 5 different contents (text + image)
- Respects random delays between posts for natural behavior
- Logs every action with status and error details

---

## Features

| Feature | Detail |
|---|---|
| **Multiple contents** | Up to 5 text + image entries, randomly selected |
| **Smart scheduling** | Configurable random delay, active hours, posts per day |
| **Facebook Page mode** | Auto-switches to your Page before posting |
| **Anti-repetition** | Per-group cooldown, content rotation |
| **Group detection** | Automatic scraping + manual ID entry |
| **Dashboard** | Real-time stats, status, next scheduled post |
| **Activity log** | Full history, filters, CSV export |
| **Light / dark theme** | Adaptive interface |

---

## Quick Installation

### Requirements
- Google Chrome (version 88+)
- Logged in to Facebook in Chrome

### Steps

**1. Download the project**
```bash
git clone https://github.com/your-username/fb-group-auto-publisher.git
cd fb-group-auto-publisher
```

**2. Generate icons** *(first install only)*
```bash
bash generate_icons.sh
```

**3. Load in Chrome**
1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the project folder

**4. Pin the extension**
- Click the puzzle icon 🧩 in Chrome → pin **FB Auto Publisher**

---

## Getting Started in 4 Steps

### 1. Create your contents
`Extension icon` → **Settings & Contents** → **New content**

Create up to 5 contents, each with a text body and an optional image.

### 2. Add your groups
**Dashboard** → **Groups** → **Detect groups**

Or add them manually using the group ID (found in the Facebook URL: `facebook.com/groups/`**`YOUR_ID`**).

### 3. Configure the schedule
**Settings** → Fill in:
```
Posts per day per group : 1
Minimum delay          : 20 min
Maximum delay          : 40 min
Start hour             : 8
End hour               : 22
```

### 4. Enable automation
Toggle **ON** in the popup or dashboard → automation starts immediately.

---

## Facebook Page Mode

To post as your Page instead of your personal profile:

1. Go to **Settings** → **"Post as a Facebook Page"** section
2. Enable the toggle
3. Fill in:
   - **Page name**: exactly as displayed in the Facebook account switcher
   - **ID / Username**: visible in your Page URL

The extension automatically switches to the Page before each post, then switches back to your personal profile afterwards.

---

## Project Structure

```
fb-group-auto-publisher/
│
├── manifest.json        # Manifest V3 configuration
├── background.js        # Service Worker (alarms, orchestration)
├── content.js           # Passive group detection on FB pages
│
├── storage.js           # Data layer (chrome.storage.local)
├── scheduler.js         # Post timing computation
├── poster.js            # Publishing + Page account switching
├── ui.js                # Shared UI helpers (toasts, modals)
│
├── popup.html/js        # Quick popup (stats + toggle)
├── dashboard.html/js    # Full dashboard
├── options.html/js      # Content management
├── groups.html/js       # Group management
├── settings.html/js     # Scheduling settings
├── logs.html/js         # Activity log
│
├── styles.css           # Design system (light/dark theme)
└── assets/              # PNG icons
```

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Save contents, groups, and settings locally |
| `alarms` | Trigger scheduled publications |
| `tabs` | Open Facebook groups in the background |
| `scripting` | Inject the publishing script into FB pages |
| `notifications` | Success / error alerts |
| `https://www.facebook.com/*` | Access group pages |

---

## Known Limitations

- Facebook regularly changes its interface — CSS selectors may need periodic updates
- MV3 Service Workers sleep after inactivity (data persists, alarms do not — the alarm reschedules on the next interaction)
- Automatic group detection depends on the rendering of `/groups/feed/`

---

## License

MIT — free to use, modify, and distribute.
