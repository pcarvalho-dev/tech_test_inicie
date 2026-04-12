const API_URL = 'http://localhost:3000/api';

async function getAuth(): Promise<{ token: string; user: { id: string; name: string; role: string } } | null> {
  const { token, user } = await chrome.storage.local.get(['token', 'user']) as {
    token?: string;
    user?: { id: string; name: string; role: string };
  };
  if (!token || !user) return null;
  return { token, user };
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
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'presence-ping') {
    sendPresencePing();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'start-presence') {
    chrome.alarms.create('presence-ping', { periodInMinutes: 0.25 });
    sendPresencePing();
    sendResponse({ ok: true });
  }

  if (msg.type === 'stop-presence') {
    chrome.alarms.clear('presence-ping');
    sendResponse({ ok: true });
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.clearAll();
  const auth = await getAuth();
  if (auth) {
    chrome.alarms.create('presence-ping', { periodInMinutes: 0.25 });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const auth = await getAuth();
  if (auth) {
    chrome.alarms.create('presence-ping', { periodInMinutes: 0.25 });
  }
});
