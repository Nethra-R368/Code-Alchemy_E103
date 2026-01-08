const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const loadingIndicator = document.getElementById('loading');
const apiKeyInput = document.getElementById('api-key');
const dangerAlert = document.getElementById('danger-alert');
const voiceInputBtn = document.getElementById('voice-input-btn');
const voiceOutputBtn = document.getElementById('voice-output-btn');
const clearChatBtn = document.getElementById('clear-chat');

let isVoiceOutputEnabled = true;
let isRecording = false;
let chatHistory = [];
let pendingAction = null;

// ==================== VOICE RECOGNITION (OFFSCREEN) ====================
async function setupOffscreen() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'sidebar/offscreen.html',
    reasons: ['AUDIO_PLAYBACK', 'USER_MEDIA'],
    justification: 'Microphone access for voice commands'
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'REC_STARTED') {
    isRecording = true;
    voiceInputBtn.classList.add('recording');
    userInput.placeholder = "Listening...";
  } else if (message.type === 'REC_ENDED') {
    isRecording = false;
    voiceInputBtn.classList.remove('recording');
    userInput.placeholder = "Type or speak...";
  } else if (message.type === 'REC_RESULT') {
    const transcript = message.transcript.toLowerCase();
    userInput.value = transcript;
    
    if (pendingAction) {
      if (transcript.includes("yes")) {
        addMessage("✅ Confirmed. Executing now.", 'bot');
        speak("Confirmed. Executing now.");
        handleAIAction(pendingAction.tabId, pendingAction.action);
        pendingAction = null;
        return;
      }
      if (transcript.includes("no")) {
        addMessage("❌ Cancelled. No action taken.", 'bot');
        speak("Cancelled.");
        pendingAction = null;
        return;
      }
    }
    sendMessage();
  } else if (message.type === 'REC_ERROR') {
    isRecording = false;
    voiceInputBtn.classList.remove('recording');
    userInput.placeholder = "Type or speak...";
    if (message.error === 'not-allowed') {
      addMessage("❌ Microphone access denied. Opening permission page...", 'bot');
      chrome.tabs.create({ url: chrome.runtime.getURL('sidebar/permissions.html') });
    } else {
      addMessage("❌ Microphone error: " + message.error, 'bot');
    }
  }
});

// ==================== BUTTONS ====================
voiceInputBtn.addEventListener('click', async () => {
  if (isRecording) {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
    return;
  }

  try {
    await setupOffscreen();
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_RECORDING' });
  } catch (e) {
    console.error("Offscreen setup error:", e);
    addMessage("❌ Error starting microphone.", 'bot');
  }
});

voiceOutputBtn.addEventListener('click', () => {
  isVoiceOutputEnabled = !isVoiceOutputEnabled;
  voiceOutputBtn.classList.toggle('active', isVoiceOutputEnabled);
});

clearChatBtn.addEventListener('click', () => {
  chatContainer.innerHTML = '';
  chatHistory = [];
  addMessage("Conversation cleared.", 'bot');
});

// ==================== VOICE OUTPUT ====================
function speak(text) {
  if (!isVoiceOutputEnabled) return;
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Improve audio clarity
  const voices = window.speechSynthesis.getVoices();
  // Prefer a high-quality English voice if available
  const preferredVoice = voices.find(v => v.lang.includes('en-US') && v.name.includes('Google')) || voices.find(v => v.lang.includes('en'));
  if (preferredVoice) utterance.voice = preferredVoice;
  
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  window.speechSynthesis.speak(utterance);
}

// Ensure voices are loaded
window.speechSynthesis.onvoiceschanged = () => {
  window.speechSynthesis.getVoices();
};

// ==================== INPUT HANDLERS ====================
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// ==================== MAIN SEND FUNCTION ====================
async function sendMessage() {
  const text = userInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  if (!text || !apiKey) return;

  addMessage(text, 'user');
  userInput.value = '';
  showLoading(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 🚫 Block restricted pages
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      addMessage("⚠ I cannot access browser system pages. Please open a normal website and try again.", 'bot');
      speak("I cannot access browser system pages. Please open a normal website.");
      showLoading(false);
      return;
    }

    let pageContent;

    // 🛠 Try to talk to content script
    try {
      pageContent = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTENT' });
    } catch (e) {
      // Inject content script if missing
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
      });

      // Wait for injection
      await new Promise(resolve => setTimeout(resolve, 500));

      // Retry
      pageContent = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTENT' });
    }

    const response = await callGroqAPI(apiKey, text, pageContent);

    addMessage(response.answer, 'bot');
    speak(response.answer);

    if (response.actions && Array.isArray(response.actions)) {
      for (const action of response.actions) {
        // ⚠ Human-in-the-loop check for sensitive actions
        if (action.action === 'click' && action.selector) {
          try {
            const danger = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_DANGER_ZONES' });
            if (danger && danger.dangerZones) {
              pendingAction = { tabId: tab.id, action };
              addMessage("⚠ This is a sensitive action. Should I proceed? Say YES or NO.", 'bot');
              speak("This is a sensitive action. Should I proceed?");
              showLoading(false);
              return;
            }
          } catch (e) {
            console.warn("Could not check danger zones:", e);
          }
        }

        if (action.action && action.selector) {
          console.log("Executing action:", action);
          try {
            await handleAIAction(tab.id, action);
            // Small delay between actions for visual effect
            await new Promise(r => setTimeout(r, 800));
          } catch (e) {
            console.error("Action execution failed:", e);
          }
        }
      }
    }
  } catch (error) {
    addMessage("❌ Error: " + error.message, 'bot');
  } finally {
    showLoading(false);
  }
}

// ==================== UI HELPERS ====================
function addMessage(text, sender) {
  chatHistory.push({ text, sender });
  renderMessage(text, sender);
}

function renderMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender === 'user' ? 'user-msg' : 'bot-msg'}`;
  msgDiv.innerHTML = `<div class="msg-content">${text}</div>`;
  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showLoading(show) {
  loadingIndicator.classList.toggle('hidden', !show);
}

// ==================== LLM CALL ====================
async function callGroqAPI(apiKey, question, pageContent) {
    const systemPrompt = `
		You are a voice-enabled AI Navigator.
		Guide users step-by-step on websites.
		
		IMPORTANT: 
		1. When a user asks to "find", "navigate", "go to", "show", or "search", you MUST use the "highlight" action on the relevant element.
		2. Look carefully at the "Elements" list. Use the "text" field from the elements list as the "selector".
		3. For "Next", "Continue", or "Proceed" buttons, ALWAYS use the "highlight" action first.
		4. If the user's intent is to click, provide both "highlight" and "click" actions in the array.
		5. If you need to navigate to a new page, find the link or button that leads there and click it.
		
		If an action is sensitive (payment, checkout, subscription), allow it ONLY after confirmation.
		
		Page Title: ${pageContent.title}
		URL: ${pageContent.url}
		Elements: ${JSON.stringify(pageContent.elements)}
		
		Format:
		Answer: (spoken explanation)
		Actions: [{"action": "highlight", "selector": "exact text from the elements list"}, {"action": "click", "selector": "exact text from the elements list"}]
		`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${apiKey}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.5
    })
  });

  const data = await response.json();
  const content = data.choices[0].message.content;

  let answer = content;
  let actions = null;

  const answerMatch = content.match(/Answer:\s*([\s\S]*?)(?=Actions:|$)/i);
  const actionsMatch = content.match(/Actions:\s*([\s\S]*)/i);

  if (answerMatch) answer = answerMatch[1].trim();
  
  // More robust action parsing
  try {
    if (actionsMatch && !actionsMatch[1].toLowerCase().includes("none")) {
      const jsonMatch = actionsMatch[1].match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        actions = JSON.parse(jsonMatch[0]);
      }
    }
    
    // Fallback: If no actions found in "Actions:" block, look for JSON anywhere in content
    if (!actions) {
      const anyJsonMatch = content.match(/\[\s*\{\s*"action"[\s\S]*\}\s*\]/);
      if (anyJsonMatch) {
        actions = JSON.parse(anyJsonMatch[0]);
      }
    }
  } catch (e) {
    console.error("Action parsing error:", e);
  }

  return { answer, actions };
}

// ==================== EXECUTE ACTIONS ====================
async function handleAIAction(tabId, action) {
  const map = { 
    'scroll': 'SCROLL_TO_ELEMENT', 
    'highlight': 'HIGHLIGHT_ELEMENT', 
    'click': 'CLICK_ELEMENT' 
  };
  
  const type = map[action.action];
  const selector = action.selector || action.element?.text || action.element?.selector;

  if (type && selector) {
    return chrome.tabs.sendMessage(tabId, { 
      type: type, 
      selector: selector 
    });
  }
}

// ==================== DANGER BANNER ====================
setInterval(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith("chrome://")) return;

    const res = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_DANGER_ZONES' });
    dangerAlert.classList.toggle('hidden', !(res && res.dangerZones));
  } catch (e) {}
}, 3000);
