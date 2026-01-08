let recognition = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'START_RECORDING') {
    startRecording();
  } else if (message.type === 'STOP_RECORDING') {
    stopRecording();
  }
});

function startRecording() {
  if (recognition) return;

  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    chrome.runtime.sendMessage({ type: 'REC_STARTED' });
  };

  recognition.onend = () => {
    chrome.runtime.sendMessage({ type: 'REC_ENDED' });
    recognition = null;
  };

  recognition.onerror = (event) => {
    chrome.runtime.sendMessage({ type: 'REC_ERROR', error: event.error });
    recognition = null;
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chrome.runtime.sendMessage({ type: 'REC_RESULT', transcript });
  };

  recognition.start();
}

function stopRecording() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
}
