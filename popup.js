// popup.js

// IMPORTANT: REPLACE WITH YOUR ACTUAL REPLIT DEV URL
const API_URL = "https://CHANGE_ME_TO_YOUR_REPLIT_DEV_URL.replit.dev/api/extension/query"; 

let currentSteps = [];
let currentStepIndex = 0;

function speak(text) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

async function executeNextStep() {
    if (currentStepIndex >= currentSteps.length) {
        const responseArea = document.getElementById('response-area');
        responseArea.innerHTML += '<div class="success" style="margin-top:10px; color: green;">✅ All steps completed!</div>';
        return;
    }

    const step = currentSteps[currentStepIndex];
    const responseArea = document.getElementById('response-area');
    
    // Voice explanation
    speak(step.explanation || `Executing ${step.action} on ${step.selector}`);

    const stepEl = document.createElement('div');
    stepEl.className = 'step-executing';
    stepEl.style.padding = '8px';
    stepEl.style.borderLeft = '4px solid #3b82f6';
    stepEl.style.marginBottom = '8px';
    stepEl.innerHTML = `<strong>Step ${currentStepIndex + 1}:</strong> ${step.action} - ${step.selector || ''}`;
    responseArea.appendChild(stepEl);

    if (step.requiresConfirmation) {
        const confirmBtn = document.createElement('button');
        confirmBtn.innerText = "Confirm Action";
        confirmBtn.style.marginTop = "4px";
        confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            await runStep(step);
        };
        stepEl.appendChild(confirmBtn);
    } else {
        await runStep(step);
    }
}

async function runStep(step) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { action: "execute", step }, (response) => {
        if (response && response.success) {
            currentStepIndex++;
            executeNextStep();
        } else {
            const responseArea = document.getElementById('response-area');
            responseArea.innerHTML += `<div class="error">Failed at step ${currentStepIndex + 1}: ${response?.error || 'Unknown error'}</div>`;
        }
    });
}

document.getElementById('ask-btn').addEventListener('click', async () => {
    const query = document.getElementById('query-input').value;
    if (!query) return;

    const responseArea = document.getElementById('response-area');
    const btn = document.getElementById('ask-btn');
    
    responseArea.innerHTML = '<div class="loading">Analyzing page and thinking...</div>';
    btn.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.tabs.sendMessage(tab.id, { action: "scanDOM" }, async (response) => {
            if (!response) {
                responseArea.innerHTML = '<div class="error">Could not scan page. Try reloading the page.</div>';
                btn.disabled = false;
                return;
            }

            const { dom, title, url } = response;

            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query,
                        url: url,
                        pageTitle: title,
                        domContext: dom
                    })
                });

                if (!res.ok) throw new Error('Backend error: ' + res.status);
                
                const aiData = await res.json();
                
                responseArea.innerHTML = `<div class="explanation">${aiData.explanation}</div>`;
                
                if (aiData.steps && aiData.steps.length > 0) {
                    currentSteps = aiData.steps;
                    currentStepIndex = 0;
                    
                    const runBtn = document.createElement('button');
                    runBtn.innerText = "Start Agent Steps";
                    runBtn.className = "primary-btn";
                    runBtn.style.marginTop = "10px";
                    runBtn.onclick = () => {
                        runBtn.disabled = true;
                        executeNextStep();
                    };
                    responseArea.appendChild(runBtn);
                }

                if (aiData.directAnswer) {
                     responseArea.innerHTML += `<div class="answer" style="margin-top:8px; background:#f0f7ff; padding:8px; border-radius:4px;"><strong>Answer:</strong> ${aiData.directAnswer}</div>`;
                }

            } catch (err) {
                responseArea.innerHTML = `<div class="error">Error: ${err.message}.</div>`;
            } finally {
                btn.disabled = false;
            }
        });

    } catch (err) {
        responseArea.innerHTML = `<div class="error">Extension Error: ${err.message}</div>`;
        btn.disabled = false;
    }
});

