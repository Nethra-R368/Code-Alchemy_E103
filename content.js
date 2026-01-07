// content.js - DOM Extraction & Agent Actions

function getInteractiveElements() {
  const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]');
  const domData = [];

  elements.forEach((el) => {
    if (!isVisible(el)) return;

    const rect = el.getBoundingClientRect();
    domData.push({
      tagName: el.tagName.toLowerCase(),
      text: (el.innerText || el.value || el.placeholder || "").slice(0, 100).trim(), // Truncate text
      id: el.id,
      className: el.className,
      path: getCssPath(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });
  });

  return domData;
}

function isVisible(el) {
    return !!( el.offsetWidth || el.offsetHeight || el.getClientRects().length );
}

function getCssPath(el) {
    if (!(el instanceof Element)) return;
    var path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        var selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            var sib = el, nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector)
                   nth++;
            }
            if (nth != 1)
                selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

function highlightElement(selector) {
    // Remove existing highlights
    const existing = document.querySelectorAll('.ai-guide-highlight');
    existing.forEach(e => e.remove());

    const el = document.querySelector(selector);
    if (el) {
        const rect = el.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = 'ai-guide-highlight';
        overlay.style.position = 'absolute';
        overlay.style.border = '2px solid #ff0000';
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';
        overlay.style.borderRadius = '4px';
        overlay.style.boxShadow = '0 0 10px rgba(255,0,0,0.5)';
        document.body.appendChild(overlay);

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Remove after 5 seconds
        setTimeout(() => overlay.remove(), 5000);
    }
}

// Action Handlers
const actions = {
  click: (selector) => {
    const el = document.querySelector(selector);
    if (el) {
      el.click();
      return true;
    }
    return false;
  },
  type: (selector, text) => {
    const el = document.querySelector(selector);
    if (el) {
      // Security Check: Don't type into CVV/Password fields unless specifically allowed
      // (The backend should already follow these guardrails, but we check here too)
      if (el.type === 'password' || /cvv|otp|password/i.test(el.id) || /cvv|otp|password/i.test(el.name)) {
        throw new Error("Security block: Automated typing into sensitive fields is disabled.");
      }
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  },
  scrollIntoView: (selector) => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    return false;
  },
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  focus: (selector) => {
    const el = document.querySelector(selector);
    if (el) {
      el.focus();
      return true;
    }
    return false;
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scanDOM") {
    const dom = getInteractiveElements();
    sendResponse({ dom: dom, title: document.title, url: window.location.href });
  } else if (request.action === "highlight") {
    highlightElement(request.selector);
    sendResponse({ success: true });
  } else if (request.action === "execute") {
    const { step } = request;
    try {
      if (step.action === 'wait') {
        actions.wait(step.ms).then(() => sendResponse({ success: true }));
        return true; // async
      } else {
        const success = actions[step.action](step.selector, step.text);
        sendResponse({ success: success });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
});

