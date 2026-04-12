const API_URL = 'http://localhost:3000/api';

async function connectSseStream() {
  const auth = await getAuth();
  if (!auth) return;

  try {
    const response = await fetch(`${API_URL}/screenshots/stream`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });

    if (!response.ok || !response.body) throw new Error('SSE connect failed');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        let eventType = 'message';
        let data = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          if (line.startsWith('data: ')) data = line.slice(6).trim();
        }
        if (eventType === 'screenshot_request' && data) {
          try {
            const payload = JSON.parse(data);
            await captureAndUpload({
              requestId: payload.requestId,
              professorId: payload.professorId,
              alunoId: auth.user.id,
            });
          } catch { /* ignore */ }
        }
      }
    }
  } catch { /* stream ended */ }

  chrome.alarms.create('sse-reconnect', { delayInMinutes: 0.05 });
}

async function getAuth(): Promise<{ token: string; user: { id: string; name: string; role: string } } | null> {
  const { token, user } = await chrome.storage.local.get(['token', 'user']) as {
    token?: string;
    user?: { id: string; name: string; role: string };
  };
  if (!token || !user) return null;
  return { token, user };
}

async function checkPendingScreenshot(auth: { token: string; user: { id: string; name: string; role: string } }) {
  try {
    const res = await fetch(`${API_URL}/screenshots/pending`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) return;
    const pending = await res.json();
    if (pending?.requestId) {
      await captureAndUpload({
        requestId: pending.requestId,
        professorId: pending.professorId,
        alunoId: auth.user.id,
      });
    }
  } catch {
    // ignore
  }
}

async function sendPresencePing() {
  const auth = await getAuth();
  if (!auth) {
    chrome.alarms.clear('presence-ping');
    return;
  }

  try {
    await fetch(`${API_URL}/presence/ping`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
    });
  } catch {
    // ignore
  }

  await checkPendingScreenshot(auth);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'presence-ping') sendPresencePing();
  if (alarm.name === 'sse-reconnect') connectSseStream();
});

async function captureAndUpload(data: {
  requestId: string;
  professorId: string;
  alunoId: string;
}) {
  const auth = await getAuth();
  if (!auth) return;

  let windowId: number | undefined;
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (win?.id) {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (activeTab?.url?.startsWith('http')) {
        windowId = win.id;
      }
    }
  } catch { /* ignore */ }

  if (windowId === undefined) {
    try {
      const [httpTab] = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      if (httpTab?.windowId !== undefined) windowId = httpTab.windowId;
    } catch { /* ignore */ }
  }

  let dataUrl: string;
  try {
    if (windowId === undefined) throw new Error('no capturable tab');
    dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch {
    await fetch(`${API_URL}/screenshots/capture-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ requestId: data.requestId, professorId: data.professorId }),
    }).catch(() => {});
    return;
  }

  const imageBase64 = dataUrl.replace('data:image/png;base64,', '');

  try {
    const res = await fetch(`${API_URL}/screenshots/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        requestId: data.requestId,
        professorId: data.professorId,
        imageBase64,
      }),
    });
    if (!res.ok) throw new Error(`upload status ${res.status}`);
  } catch {
    await fetch(`${API_URL}/screenshots/capture-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ requestId: data.requestId, professorId: data.professorId }),
    }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'start-presence') {
    chrome.alarms.create('presence-ping', { periodInMinutes: 0.25 });
    sendPresencePing();
    connectSseStream();
    sendResponse({ ok: true });
  }

  if (msg.type === 'stop-presence') {
    chrome.alarms.clear('presence-ping');
    sendResponse({ ok: true });
  }

  if (msg.type === 'capture') {
    captureAndUpload(msg.data).then(() => sendResponse({ success: true }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.clearAll();
  const auth = await getAuth();
  if (auth) {
    chrome.alarms.create('presence-ping', { periodInMinutes: 0.25 });
    connectSseStream();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const auth = await getAuth();
  if (auth) {
    chrome.alarms.create('presence-ping', { periodInMinutes: 0.25 });
    connectSseStream();
  }
});
