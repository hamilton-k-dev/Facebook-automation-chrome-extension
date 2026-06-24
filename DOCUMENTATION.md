# Technical Documentation — FB Group Auto Publisher

## Table of Contents

1. [General Architecture](#1-general-architecture)
2. [Files and Responsibilities](#2-files-and-responsibilities)
3. [Data Storage](#3-data-storage)
4. [Post Lifecycle](#4-post-lifecycle)
5. [Facebook Page Mode](#5-facebook-page-mode)
6. [User Interface](#6-user-interface)
7. [Group Detection](#7-group-detection)
8. [Anti-Repetition and Scheduling](#8-anti-repetition-and-scheduling)
9. [Chrome Permissions](#9-chrome-permissions)
10. [Troubleshooting](#10-troubleshooting)
11. [Potential Improvements](#11-potential-improvements)

---

## 1. General Architecture

The extension follows the **Manifest V3** model with a strict separation between:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHROME BROWSER                           │
│                                                                 │
│  ┌──────────────────┐     messages      ┌──────────────────┐   │
│  │  Service Worker  │ ◄────────────────► │   UI Pages       │   │
│  │  (background.js) │                   │  popup / dash /  │   │
│  │                  │                   │  options / logs  │   │
│  │  - Alarms        │                   └──────────────────┘   │
│  │  - Orchestration │                                           │
│  │  - Scheduler     │     scripting     ┌──────────────────┐   │
│  │  - Poster        │ ──────────────── ►│  Facebook pages  │   │
│  └──────────────────┘                   │  (hidden tabs)   │   │
│                                         └──────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               chrome.storage.local                        │  │
│  │  contents | groups | settings | logs | stats | history   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Manifest V3 Constraint

MV3 Service Workers can be suspended after ~30 seconds of inactivity. Scheduling therefore relies on `chrome.alarms` (persistent) rather than `setInterval` (non-persistent). The worker wakes up at each alarm, executes the post, and goes back to sleep.

---

## 2. Files and Responsibilities

### `background.js` — Service Worker

Central entry point. Listens to Chrome alarms and messages sent by UI pages.

**Handled events:**
| Event | Action |
|---|---|
| `onInstalled` | Initialises the scheduler if automation is active |
| `onStartup` | Restarts the scheduler after browser restart |
| `alarms.onAlarm` | Triggers `runAutoPost()` then reschedules |
| `runtime.onMessage` | Dispatches UI actions (toggle, manual post, etc.) |

**Accepted messages:**
```javascript
{ type: 'GET_GROUPS_FROM_FB' }
{ type: 'TOGGLE_AUTOMATION', enabled: bool }
{ type: 'MANUAL_POST' }
{ type: 'RESCHEDULE' }
{ type: 'STOP_SCHEDULER' }
```

---

### `storage.js` — Data Layer

Centralises all `chrome.storage.local` operations. Exposes typed functions for each entity.

**Data structures:**

```javascript
// Content
{
  id: "1717000000000",        // timestamp as string
  text: "Post text",
  imageData: "data:image/jpeg;base64,..."  // null if no image
}

// Group
{
  id: "123456789",             // Facebook ID or username
  name: "Group Name",
  url: "https://www.facebook.com/groups/123456789",
  selected: true,              // included in publishing pool
  excluded: false              // permanently excluded
}

// Settings
{
  enabled: false,
  postsPerDay: 1,
  delayMin: 20,                // minutes
  delayMax: 40,                // minutes
  startHour: 8,                // window start (0–23)
  endHour: 22,                 // window end (0–23)
  cooldownDays: 1,
  pageMode: false,             // post as Page
  pageId: "",                  // Page ID or username
  pageName: ""                 // display name of the Page
}

// Log entry
{
  id: "1717000000000",
  timestamp: "2025-01-15T10:30:00.000Z",
  group: "Group Name",
  groupId: "123456789",
  content: "First 100 chars...",
  contentId: "1717000000001",
  status: "success" | "error",
  message: "Post published successfully"
}

// Post history (keyed by groupId)
{
  "123456789": [
    { contentId: "...", timestamp: "...", date: "Mon Jan 15 2025" },
    ...  // max 30 entries per group
  ]
}

// Stats
{
  totalPosts: 42,
  todayPosts: 3,
  lastResetDate: "Mon Jan 15 2025",
  lastPost: { groupId, groupName, contentId },
  lastPostDate: "2025-01-15T10:30:00.000Z",
  nextPost: "2025-01-15T11:05:00.000Z"
}
```

---

### `scheduler.js` — Scheduling

Computes the next post time and checks group eligibility.

**Scheduling algorithm:**
```
now + random_delay(delayMin, delayMax) minutes
  → if result < startHour  → shift to startHour:00–30
  → if result >= endHour   → shift to next day at startHour:00–30
```

**Eligible group selection:**
```
active groups (selected=true, excluded=false)
  → filter: postsToday < postsPerDay
  → pick randomly from eligible pool
```

**Content selection:**
```
all available contents
  → if last content used in this group is known:
      prefer a different content (if alternatives exist)
  → pick randomly
```

---

### `poster.js` — Publishing

Orchestrates tab opening, account switching, and posting script injection.

**Full flow:**

```
publishToGroup(group, content)
  │
  ├─ [if pageMode] switchToFacebookAccount(pageId, pageName, 'page')
  │     └─ Open facebook.com → inject fbSwitchAccountScript → close tab
  │
  ├─ Open https://www.facebook.com/groups/{id} (hidden tab)
  ├─ Wait for full load + 3s (Facebook JS)
  ├─ Inject fbPostScript(text, imageData)
  │     ├─ Click the composer trigger
  │     ├─ Find the visible text field
  │     ├─ Insert text (Clipboard API → fallback insertText)
  │     ├─ [if image] Click Photo → inject into input[file]
  │     └─ Click Publish
  ├─ Record log + stats + history
  ├─ Close group tab
  └─ [if pageMode] switchToFacebookAccount(null, null, 'personal')
```

**Text insertion:**

The extension uses the Clipboard API first because Facebook blocks most direct insertion methods in its `contenteditable` fields. If the Clipboard API fails (insecure context or permission denied), it falls back to `document.execCommand('insertText')`.

---

### `content.js` — Content Script

Injected on all `facebook.com` pages. Observes DOM mutations to detect group links and forwards them to the Service Worker via `chrome.runtime.sendMessage`.

Detected groups are filtered to exclude Facebook's system routes (`feed`, `discover`, `create`, `joins`, `membership`).

---

### `ui.js` — UI Utilities

Shared module across all UI pages. Provides:

| Function | Role |
|---|---|
| `showToast(type, title, message)` | Floating notification (4 types) |
| `openModal(html)` / `closeModal()` | Generic modal overlay |
| `confirmDialog(message)` | Promise-based confirm dialog |
| `formatDate(isoString)` | en-US date formatting |
| `initTheme()` / `toggleTheme()` | Theme persistence in localStorage |
| `escapeHtml(str)` | XSS sanitisation |

---

## 3. Data Storage

All data is stored in `chrome.storage.local` (persists across sessions, no practical quota limit for this use case).

**Storage keys:**

| Key | Type | Limit |
|---|---|---|
| `contents` | Array | Max 5 entries |
| `groups` | Array | Unlimited |
| `settings` | Object | — |
| `logs` | Array | Max 500 entries (FIFO) |
| `stats` | Object | — |
| `postHistory` | Object (keyed by groupId) | Max 30 entries per group |

**No data is sent to any external server.** Everything stays local in your browser.

---

## 4. Post Lifecycle

```
chrome.alarms → 'fb-auto-post' fires
        │
        ▼
background.js : runAutoPost()
        │
        ├─ settings.enabled? no → stop
        ├─ within active hours? no → stop
        ├─ getEligibleGroup() → no group? stop
        ├─ getRandomContent() → no content? stop
        │
        ▼
poster.js : publishToGroup(group, content)
        │
        ├─ [pageMode] Switch → Page
        ├─ Open group tab
        ├─ Wait for load
        ├─ Inject script → post
        ├─ Record result (log + stats + history)
        ├─ Close tab
        └─ [pageMode] Switch → Personal profile
        │
        ▼
scheduler.js : scheduleNextPost()
        │
        └─ Compute next time → chrome.alarms.create()
```

---

## 5. Facebook Page Mode

When `pageMode: true`, the extension performs an account switch before and after each post.

**Switch script (`fbSwitchAccountScript`):**

The script injected into `facebook.com` looks for the profile menu button in the header, opens it, then identifies the target Page by:
1. Exact name match in menu items
2. ID/username match in `href` attributes
3. Opening a potential "Switch account" sub-menu and searching again

The switch back to personal profile looks for keywords like `personal`, `profile`, `personal account`. If not found, the failure is silent (non-blocking) so it doesn't interrupt the post cycle.

**Profile menu selectors used:**
```javascript
'[aria-label="Account"]'
'[aria-label="Your account menu"]'
// + fallback on profile images in the navigation bar
```

> These selectors may need updating if Facebook changes its markup.

---

## 6. User Interface

### Available Pages

| Page | File | Role |
|---|---|---|
| Popup | `popup.html` | Quick access: stats, toggle, links |
| Dashboard | `dashboard.html` | Full overview |
| Contents | `options.html` | CRUD for up to 5 contents |
| Groups | `groups.html` | Group management + detection |
| Settings | `settings.html` | Schedule + Page configuration |
| Logs | `logs.html` | Filterable history + CSV export |

### Design System (`styles.css`)

Centralised CSS variables supporting two themes:

```css
:root {
  --primary: #1877f2;   /* Facebook blue */
  --success: #42b883;
  --danger:  #e74c3c;
  --bg:      #f0f2f5;
  --surface: #ffffff;
  --border:  #dddfe2;
}

[data-theme="dark"] {
  --bg:      #18191a;
  --surface: #242526;
  --border:  #3a3b3c;
}
```

The theme is persisted in `localStorage` under the key `theme`.

---

## 7. Group Detection

**Automatic method:**

The extension opens `https://www.facebook.com/groups/feed/` in the background and scans `a[href*="/groups/"]` links to extract group IDs and names.

```javascript
// Extraction regex
href.match(/facebook\.com\/groups\/([^/?#]+)/)
// System route filter
!/^(feed|discover|create|joins|membership)$/.test(groupId)
```

**Passive method (content script):**

On all Facebook pages visited normally, `content.js` observes DOM mutations and forwards detected groups. New entries are automatically added to the list.

**Manual method:**

In the Groups page, the user can paste a URL or ID directly:
- Full URL: `https://www.facebook.com/groups/123456789`
- Just the ID: `123456789`
- Username: `group-name`

---

## 8. Anti-Repetition and Scheduling

### Daily limit per group

Before selecting a group, `getEligibleGroup()` checks:
```javascript
postHistory[groupId].filter(h => h.date === today).length < settings.postsPerDay
```

### Content rotation

`getRandomContent(groupId)` retrieves the last content used in that group and excludes it from the random draw if alternatives are available.

### Cooldown

The `cooldownDays` setting is stored and can be used to enforce a minimum time between re-publishing the same content in the same group via `postHistory`.

---

## 9. Chrome Permissions

```json
"permissions": ["storage", "alarms", "tabs", "scripting", "notifications", "activeTab"],
"host_permissions": ["https://www.facebook.com/*", "https://facebook.com/*"]
```

| Permission | Precise justification |
|---|---|
| `storage` | Local persistence for contents, groups, settings, logs |
| `alarms` | `chrome.alarms.create()` to schedule posts |
| `tabs` | `chrome.tabs.create()` to open groups in background |
| `scripting` | `chrome.scripting.executeScript()` to inject posting and switching scripts |
| `notifications` | `chrome.notifications.create()` for success/error alerts |
| `activeTab` | Access the active tab from the popup |
| `host_permissions facebook.com` | Allow `scripting` and `tabs` on Facebook pages |

---

## 10. Troubleshooting

### "Post composer not found"

**Cause:** Facebook changed the `aria-label` values or DOM structure of the composer.

**Fix:**
1. Open a Facebook group manually
2. Inspect the "Create a post" button (F12 → Element picker)
3. Update `composerSelectors` in `poster.js` (inside `fbPostScript`)

---

### "Page X not found in account switch menu"

**Cause:** The name entered in Settings doesn't exactly match what Facebook displays in the dropdown.

**Fix:**
1. Go to **Settings** → Page section
2. Open Facebook → click your avatar (top-right) → note the exact Page name shown
3. Update the **Page name** field

---

### Groups are not detected automatically

**Possible cause 1:** Not logged in to Facebook in Chrome.  
**Fix:** Log in to `facebook.com` then retry detection.

**Possible cause 2:** The `/groups/feed/` page doesn't render your groups (new account, low-activity groups).  
**Fix:** Add groups manually using their ID.

---

### The Service Worker stops between posts

**Expected behaviour.** Chrome suspends MV3 Service Workers after inactivity. `chrome.alarms` persists and wakes the worker at the scheduled time. Data in `chrome.storage.local` is not affected.

**If the alarm never fires:** Verify that automation is enabled in Settings and that at least one active group and one content exist.

---

### Post sent but text is empty

**Cause:** The Clipboard API was blocked (browser permissions or security context).

**Fix:** In Chrome, go to `chrome://settings/content/clipboard` and ensure `facebook.com` is not blocked. The extension falls back to `insertText` but some security configurations block both methods.

---

## 11. Potential Improvements

| Improvement | Complexity | Description |
|---|---|---|
| Multi-account support | Medium | Manage multiple profiles/Pages with separate group pools |
| Webhook notifications | Low | Send an HTTP callback after each post (Zapier/Make integration) |
| Configuration import/export | Low | Backup and restore contents + groups as JSON |
| Per-group schedule | Medium | Set specific days/hours for individual groups |
| Post preview | Low | Show a preview of the post before it's sent |
| CSS selector auto-update | Ongoing | Facebook changes its markup ~2–3 times per year |
| Reels / video support | High | Handle video file uploads in the composer |
