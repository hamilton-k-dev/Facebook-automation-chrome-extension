// Poster — handles Facebook group publishing via chrome.scripting

import {
  addLog,
  incrementStats,
  recordGroupPost,
  getSettings,
} from "./storage.js";
import {
  getEligibleGroup,
  getRandomContent,
  scheduleNextPost,
} from "./scheduler.js";

export async function publishToGroup(group, content) {
  let tabId = null;
  const settings = await getSettings();
  const usePageMode = settings.pageMode && settings.pageId;

  try {
    if (usePageMode) {
      // Open a temporary FB tab to switch to the Page
      const switchResult = await switchToFacebookAccount(
        settings.pageId,
        settings.pageName,
        "page",
      );
      if (!switchResult.success) {
        throw new Error(`Could not switch to Page: ${switchResult.error}`);
      }
    }

    // Open the group in a background tab
    const tab = await chrome.tabs.create({
      url: `https://www.facebook.com/groups/${group.id}`,
      active: false,
    });
    tabId = tab.id;

    await waitForTabLoad(tabId);
    await sleep(3000);

    // Inject the posting script
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: fbPostScript,
      args: [content.text, content.imageData || null],
    });

    const result = results?.[0]?.result;

    if (result?.success) {
      await recordGroupPost(group.id, content.id);
      await incrementStats({
        groupId: group.id,
        groupName: group.name,
        contentId: content.id,
      });
      await addLog({
        group: group.name,
        groupId: group.id,
        content: content.text.substring(0, 100),
        contentId: content.id,
        status: "success",
        message: usePageMode
          ? `Posted as Page: ${settings.pageName}`
          : "Post published successfully",
      });

      chrome.notifications.create({
        type: "basic",
        iconUrl: "assets/icon48.png",
        title: "Post published",
        message: `Posted in: ${group.name}${usePageMode ? ` (Page: ${settings.pageName})` : ""}`,
      });

      return { success: true };
    } else {
      throw new Error(result?.error || "Post failed");
    }
  } catch (err) {
    await addLog({
      group: group.name || group.id,
      groupId: group.id,
      content: content.text?.substring(0, 100) || "",
      contentId: content.id,
      status: "error",
      message: err.message,
    });
    return { success: false, error: err.message };
  } finally {
    // Close the group tab
    if (tabId) {
      await sleep(2000);
      try {
        await chrome.tabs.remove(tabId);
      } catch (_) {}
    }

    // Switch back to personal profile if Page mode was used
    if (usePageMode) {
      await switchToFacebookAccount(null, null, "personal").catch(() => {});
    }
  }
}

// ─── Facebook account switch ───────────────────────────────────────────────

async function switchToFacebookAccount(pageId, pageName, targetType) {
  let switchTabId = null;
  try {
    const tab = await chrome.tabs.create({
      url: "https://www.facebook.com/",
      active: false,
    });
    switchTabId = tab.id;
    await waitForTabLoad(switchTabId);
    await sleep(2500);

    const results = await chrome.scripting.executeScript({
      target: { tabId: switchTabId },
      func: fbSwitchAccountScript,
      args: [pageId, pageName, targetType],
    });

    const result = results?.[0]?.result;
    if (result?.success) {
      // Wait for the switch to take effect
      await sleep(3000);
    }
    return (
      result || {
        success: false,
        error: "Account switch script returned no result",
      }
    );
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (switchTabId) {
      try {
        await chrome.tabs.remove(switchTabId);
      } catch (_) {}
    }
  }
}

// Injected script to switch accounts — runs in page context
function fbSwitchAccountScript(pageId, pageName, targetType) {
  return new Promise(async (resolve) => {
    try {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // ── Step 1: Open the profile menu (top-right) ──────────────────────
      const profileBtnSelectors = [
        // Top-right account menu
        '[aria-label="Account"]',
        '[aria-label="Account"]',
        '[aria-label="Your account menu"]',
        // Fallback: profile avatar in the navigation bar
        'div[data-testid="royal_blue_bar"] img[alt]',
        'div[role="navigation"] img[class*="profilePic"]',
      ];

      let profileBtn = null;
      for (const sel of profileBtnSelectors) {
        profileBtn = document.querySelector(sel);
        if (profileBtn) break;
      }

      if (!profileBtn) {
        // Last resort: find profile image button in header
        const imgs = [...document.querySelectorAll("img[alt]")].filter(
          (img) => {
            const src = img.src || "";
            return (
              src.includes("profile") ||
              src.includes("avatar") ||
              img.width <= 40
            );
          },
        );
        profileBtn =
          imgs
            .find((img) => img.closest('[role="button"]') || img.closest("a"))
            ?.closest('[role="button"]') || imgs[0];
      }

      if (!profileBtn)
        return resolve({
          success: false,
          error: "Profile button not found in header",
        });

      profileBtn.click();
      await sleep(1500);

      // ── Step 2: Find the switch option in the open menu ────────────────
      if (targetType === "page") {
        // Search by page name or page link
        const allLinks = [
          ...document.querySelectorAll(
            '[role="menuitem"], [role="option"], a, [role="button"]',
          ),
        ];

        let switchBtn = null;

        // Match by page name
        if (pageName) {
          switchBtn = allLinks.find((el) => {
            const text = el.textContent?.trim() || "";
            return text.toLowerCase().includes(pageName.toLowerCase());
          });
        }

        // Match by pageId in hrefs
        if (!switchBtn && pageId) {
          switchBtn = allLinks.find((el) => {
            const href = el.href || el.getAttribute("href") || "";
            return href.includes(pageId);
          });
        }

        // Look for generic switch/change keywords in menu items
        if (!switchBtn) {
          const switchKeywords = ["switch", "changer", "basculer", "page"];
          const menuItems = [...document.querySelectorAll('[role="menuitem"]')];
          for (const item of menuItems) {
            const text = item.textContent?.toLowerCase() || "";
            if (switchKeywords.some((k) => text.includes(k))) {
              // Check if this item opens a sub-menu containing the Page
              item.click();
              await sleep(1000);
              // Search again after opening the sub-menu
              const subItems = [
                ...document.querySelectorAll(
                  '[role="menuitem"], [role="option"]',
                ),
              ];
              if (pageName) {
                switchBtn = subItems.find((el) =>
                  el.textContent
                    ?.toLowerCase()
                    .includes(pageName.toLowerCase()),
                );
              }
              if (switchBtn) break;
            }
          }
        }

        if (!switchBtn) {
          return resolve({
            success: false,
            error: `Page "${pageName || pageId}" not found in account switch menu`,
          });
        }

        switchBtn.click();
        await sleep(2000);
        return resolve({ success: true });
      } else {
        // targetType === 'personal': switch back to personal profile
        const allItems = [
          ...document.querySelectorAll('[role="menuitem"], [role="option"]'),
        ];
        const personalKeywords = [
          "personal",
          "profil",
          "profile",
          "compte personnel",
        ];
        let personalBtn = allItems.find((el) => {
          const text = el.textContent?.toLowerCase() || "";
          return personalKeywords.some((k) => text.includes(k));
        });

        if (!personalBtn) {
          // Look for personal profile keywords
          personalBtn = allItems.find((el) => {
            const text = el.textContent?.toLowerCase() || "";
            return text.includes("log in") || text.includes("connecter");
          });
        }

        if (personalBtn) {
          personalBtn.click();
          await sleep(2000);
        }
        // Silently ignore if not found — switch-back is non-blocking
        return resolve({ success: true });
      }
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// ─── Posting script ─────────────────────────────────────────────────────────

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (
    !style ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  )
    return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findVisibleElement(selectors, root = document) {
  for (const sel of selectors) {
    const elements = [...root.querySelectorAll(sel)];
    const visible = elements.find(isElementVisible);
    if (visible) return visible;
  }
  return null;
}

function findComposerTrigger() {
  const textHints = [
    "create a post",
    "write something",
    "what's on your mind",
    "écrire quelque chose",
    "créer une publication",
    "publier",
    "new post",
    "make a post",
    "start a post",
  ];

  const candidates = [
    ...document.querySelectorAll(
      'div[role="button"], button, a, [role="link"]',
    ),
  ];
  const matched = candidates.find((el) => {
    if (!isElementVisible(el)) return false;
    const label =
      `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`.toLowerCase();
    return textHints.some((hint) => label.includes(hint));
  });

  if (matched) return matched;

  return findVisibleElement([
    '[data-pagelet="GroupInlineComposer"] [role="button"]',
    '[aria-label="Create a post"]',
    '[aria-label="Écrire quelque chose..."]',
    '[aria-label="Write something..."]',
    '[placeholder="Écrire quelque chose..."]',
    '[placeholder="Write something..."]',
    'div[data-testid="status-attachment-mentions-input"]',
  ]);
}

function fbPostScript(text, imageDataUrl) {
  return new Promise(async (resolve) => {
    try {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      let composerTrigger = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        composerTrigger = findComposerTrigger();
        if (composerTrigger) break;
        await sleep(1000);
      }

      if (!composerTrigger)
        return resolve({ success: false, error: "Post composer not found" });

      composerTrigger.click();
      await sleep(2000);

      let textField = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        textField = findVisibleElement([
          '[role="textbox"][contenteditable="true"]',
          '[aria-label="Écrire quelque chose..."]',
          '[aria-label="Write something..."]',
          '[data-testid="status-attachment-mentions-input"]',
        ]);
        if (textField) break;
        await sleep(1000);
      }

      if (!textField)
        return resolve({ success: false, error: "Text field not found" });

      textField.focus();
      await sleep(500);

      // Insert text via clipboard API, fallback to insertText
      try {
        const item = new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        document.execCommand("paste");
        await sleep(800);
      } catch (_) {}

      if (!textField.innerText?.trim()) {
        textField.focus();
        document.execCommand("insertText", false, text);
        await sleep(500);
      }

      // Attach image if provided
      if (imageDataUrl) {
        const photoSelectors = [
          '[aria-label="Photo/vidéo"]',
          '[aria-label="Photo/Video"]',
          '[aria-label="Photo"]',
          '[data-testid="photo-selector"]',
        ];
        for (const sel of photoSelectors) {
          const btn = document.querySelector(sel);
          if (btn) {
            btn.click();
            await sleep(1500);
            break;
          }
        }

        const fileInput = document.querySelector(
          'input[type="file"][accept*="image"]',
        );
        if (fileInput) {
          const res = await fetch(imageDataUrl);
          const blob = await res.blob();
          const file = new File([blob], "image.jpg", { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(3000);
        }
      }

      // Click the Publish button
      await sleep(1000);
      const publishSelectors = [
        '[aria-label="Publish"]',
        '[aria-label="Post"]',
        '[data-testid="react-composer-post-button"]',
        'button[type="submit"]',
      ];

      let published = false;
      for (const sel of publishSelectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          published = true;
          break;
        }
      }

      if (!published)
        return resolve({
          success: false,
          error: "Publish button not found or disabled",
        });

      await sleep(3000);
      resolve({ success: true });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// ─── Auto-post orchestration ─────────────────────────────────────────────────

export async function runAutoPost() {
  const settings = await getSettings();
  if (!settings.enabled)
    return { skipped: true, reason: "Automation disabled" };

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour < settings.startHour || hour >= settings.endHour) {
    return { skipped: true, reason: "Hors plage horaire" };
  }

  const group = await getEligibleGroup(settings);
  if (!group) return { skipped: true, reason: "No eligible group" };

  const content = await getRandomContent(group.id, settings);
  if (!content) return { skipped: true, reason: "No content available" };

  const result = await publishToGroup(group, content);
  await scheduleNextPost();
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
