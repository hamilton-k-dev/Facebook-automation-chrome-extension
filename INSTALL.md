# Installation — FB Group Auto Publisher

## Installing on Chrome macOS (Developer Mode)

### Step 1: Open extension management
1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)

### Step 2: Load the extension
1. Click **"Load unpacked"**
2. Select the folder `/Users/hamilton/Projects/extension`
3. The extension appears in the list with its blue icon

### Step 3: Pin the extension
1. Click the puzzle icon 🧩 in the Chrome toolbar
2. Click the pin next to **"FB Auto Publisher"**

---

## Initial Setup

### 1. Add contents
1. Click the extension icon → **"Settings & Contents"**
2. Create up to 5 contents (text + optional image)

### 2. Detect groups
1. Open **"Dashboard"** → **"Groups"**
2. Click **"Detect groups"** — the extension briefly opens Facebook
3. Or add groups manually with the group ID

   To find a Facebook group ID:
   - Open the group on Facebook
   - The URL looks like `facebook.com/groups/XXXXXXXX`
   - Copy the `XXXXXXXX` part

### 3. Configure settings
1. Go to **"Settings"**
2. Configure:
   - Posts per day per group (e.g. 1)
   - Min/max delay between posts (e.g. 20–40 min)
   - Active hours (e.g. 08:00 – 22:00)
3. Save

### 4. Enable automation
1. Go back to the popup or dashboard
2. Toggle **"Automation"** ON
3. The first post will be scheduled automatically

---

## Required Permissions

| Permission | Usage |
|------------|-------|
| `storage` | Save contents, groups and settings |
| `alarms` | Schedule publications |
| `tabs` | Open Facebook groups |
| `scripting` | Inject the publishing script |
| `notifications` | Success/error alerts |
| `facebook.com/*` | Access group pages |

---

## How It Works

1. **Service Worker** (`background.js`): Runs in the background, manages alarms and receives messages from pages.
2. **Scheduler** (`scheduler.js`): Computes the next post time within the allowed window using a random delay.
3. **Poster** (`poster.js`): Opens the Facebook group tab, injects the publishing script, closes the tab.
4. **Content Script** (`content.js`): Passively detects groups visited on Facebook.

---

## Troubleshooting

**"Post composer not found"**
→ Facebook regularly changes its UI. The extension uses multiple CSS selector fallbacks. If it keeps failing, verify you are logged in to Facebook and try updating the selectors in `poster.js`.

**Groups not detected automatically**
→ Make sure you are logged in to Facebook in Chrome first, then click "Detect groups". Otherwise, add them manually.

**Service Worker stops**
→ Normal with Manifest V3. It restarts automatically at each alarm. Data persists in `chrome.storage.local`.

**Post blocked by Facebook**
→ Increase the minimum and maximum delays in Settings. Facebook may throttle posts that are sent too quickly.
