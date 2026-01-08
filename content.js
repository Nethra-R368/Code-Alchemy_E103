// Listen for messages from the sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_PAGE_CONTENT':
      sendResponse(extractPageContent());
      break;
    case 'SCROLL_TO_ELEMENT':
      scrollToElement(message.selector);
      sendResponse({ success: true });
      break;
    case 'HIGHLIGHT_ELEMENT':
      highlightElement(message.selector);
      sendResponse({ success: true });
      break;
    case 'CLICK_ELEMENT':
      clickElement(message.selector);
      sendResponse({ success: true });
      break;
    case 'CHECK_DANGER_ZONES':
      sendResponse({ dangerZones: detectDangerZones() });
      break;
  }
  return true;
});

function extractPageContent() {
  const selectors = [
    'h1', 'h2', 'h3', 'p', 'a', 'button', 'li', 
    'input[type="submit"]', 'input[type="button"]', 'input[type="search"]', 'input[type="text"]',
    '[role="button"]', '[role="link"]', '[role="searchbox"]',
    'svg', 'i'
  ];
  
  const elements = document.querySelectorAll(selectors.join(','));
  
  const content = Array.from(elements).map(el => {
    // Skip hidden elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0) return null;

    let text = el.innerText?.trim() || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
    
    if (!text && (el.tagName === 'SVG' || el.tagName === 'I')) {
      text = el.parentElement?.getAttribute('aria-label') || el.parentElement?.title || el.parentElement?.innerText?.trim() || '';
    }

    if (!text) return null;

    return {
      tag: el.tagName.toLowerCase(),
      text: text.substring(0, 100), // Limit text length
      id: el.id || null,
      role: el.getAttribute('role') || null,
      isInteractive: ['A', 'BUTTON', 'INPUT'].includes(el.tagName) || el.getAttribute('role') === 'button'
    };
  }).filter(item => item !== null);

  // Remove duplicates and limit
  const uniqueContent = [];
  const seen = new Set();
  for (const item of content) {
    const key = `${item.tag}-${item.text}`;
    if (!seen.has(key)) {
      uniqueContent.push(item);
      seen.add(key);
    }
  }

  return {
    title: document.title,
    url: window.location.href,
    elements: uniqueContent.slice(0, 200)
  };
}

function detectDangerZones() {
  const paymentKeywords = ['pay', 'buy', 'purchase', 'checkout', 'subscribe', 'order', 'billing', 'credit card', 'paypal'];
  const elements = document.querySelectorAll('button, a, input[type="submit"], input[type="button"], span, div');
  
  const found = Array.from(elements).filter(el => {
    if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
      if (el.children.length > 0) return false;
    }
    const text = (el.innerText || el.value || '').toLowerCase();
    return paymentKeywords.some(keyword => text.includes(keyword));
  });

  return found.length > 0;
}

function scrollToElement(selector) {
  const element = findElement(selector);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightElement(selector, true);
  }
}

function highlightElement(selector, persistent = false) {
  const element = findElement(selector);
  if (element) {
    const existing = document.querySelectorAll('.ai-highlight');
    existing.forEach(el => {
      el.classList.remove('ai-highlight');
      const label = el.querySelector('.ai-highlight-label');
      if (label) label.remove();
    });

    element.classList.add('ai-highlight');
    
    if (!document.getElementById('ai-sidebar-styles')) {
      const style = document.createElement('style');
      style.id = 'ai-sidebar-styles';
      style.innerHTML = `
        @keyframes ai-pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.8); }
          70% { box-shadow: 0 0 0 20px rgba(255, 0, 0, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
        }
        .ai-highlight {
          outline: 5px solid #ff0000 !important;
          outline-offset: 5px !important;
          animation: ai-pulse 1.5s infinite !important;
          position: relative !important;
          z-index: 9999999 !important;
          background-color: rgba(255, 255, 0, 0.3) !important;
          transition: all 0.3s ease !important;
        }
        .ai-highlight-label {
          position: absolute;
          top: -45px;
          left: 50%;
          transform: translateX(-50%);
          background: #ff0000;
          color: white;
          padding: 6px 16px;
          border-radius: 8px;
          font-size: 16px;
          white-space: nowrap;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 10000000 !important;
          border: 2px solid white;
        }
      `;
      document.head.appendChild(style);
    }

    const label = document.createElement('div');
    label.className = 'ai-highlight-label';
    label.innerHTML = `✨ AI Found This`;
    document.body.appendChild(label);
    
    const rect = element.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    label.style.position = 'absolute';
    label.style.top = `${rect.top + scrollTop - 45}px`;
    label.style.left = `${rect.left + scrollLeft + rect.width / 2}px`;
    label.style.transform = 'translateX(-50%)';
    label.style.zIndex = '10000000';

    if (!persistent) {
      setTimeout(() => {
        element.classList.remove('ai-highlight');
        label.remove();
      }, 10000); // Increased to 10 seconds for better visibility
    }
  }
}

function clickElement(selector) {
  const element = findElement(selector);
  if (element) {
    element.click();
  }
}

function findElement(selector) {
  if (!selector) return null;
  try {
    // 1. Try direct CSS selector
    try {
      let el = document.querySelector(selector);
      if (el) return el;
    } catch (e) {}

    // 2. Try finding by ID if it looks like one
    if (selector.startsWith('#')) {
      let el = document.getElementById(selector.substring(1));
      if (el) return el;
    }

    const lowerSelector = selector.toLowerCase().trim();
    
    // 3. Search all interactive elements
    const all = document.querySelectorAll('a, button, input, [role="button"], [role="link"], summary, span, div, h1, h2, h3, p');
    
    let bestMatch = null;
    let highestScore = 0;

    for (const el of Array.from(all)) {
      // Skip hidden elements
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0) continue;

      // Skip large containers unless they are buttons
      if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && el.innerText.length > 200 && el.getAttribute('role') !== 'button') continue;
      
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').toLowerCase().trim();
      if (!text) continue;

      let score = 0;
      if (text === lowerSelector) score = 100;
      else if (text.startsWith(lowerSelector)) score = 80;
      else if (text.includes(lowerSelector)) score = 50;
      
      // Boost score for exact matches on interactive elements
      if (score > 0) {
        if (['BUTTON', 'A', 'INPUT'].includes(el.tagName)) score += 20;
        if (el.getAttribute('role') === 'button') score += 20;
        
        // Prefer visible elements in the viewport
        const rect = el.getBoundingClientRect();
        if (rect.top >= 0 && rect.top <= window.innerHeight) score += 10;

        if (score > highestScore) {
          highestScore = score;
          bestMatch = el;
        }
      }
    }
    
    return bestMatch;
  } catch (e) {
    console.error("Error finding element:", e);
    return null;
  }
}
