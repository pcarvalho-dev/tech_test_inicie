// background/index.ts
var API_URL = "http://localhost:3000/api";
async function getAuth() {
  const { token, user } = await chrome.storage.local.get(["token", "user"]);
  if (!token || !user) return null;
  return { token, user };
}
async function sendPresencePing() {
  const auth = await getAuth();
  if (!auth) {
    chrome.alarms.clear("presence-ping");
    return;
  }
  try {
    await fetch(`${API_URL}/presence/ping`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}` }
    });
  } catch {
  }
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "presence-ping") {
    sendPresencePing();
  }
});
async function captureAndUpload(data) {
  const auth = await getAuth();
  if (!auth) return;
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  } catch {
    return;
  }
  const imageBase64 = dataUrl.replace("data:image/png;base64,", "");
  try {
    await fetch(`${API_URL}/screenshots/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        requestId: data.requestId,
        professorId: data.professorId,
        imageBase64
      })
    });
  } catch {
  }
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "start-presence") {
    chrome.alarms.create("presence-ping", { periodInMinutes: 0.25 });
    sendPresencePing();
    sendResponse({ ok: true });
  }
  if (msg.type === "stop-presence") {
    chrome.alarms.clear("presence-ping");
    sendResponse({ ok: true });
  }
  if (msg.type === "capture") {
    captureAndUpload(msg.data).then(() => sendResponse({ success: true }));
    return true;
  }
});
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.clearAll();
  const auth = await getAuth();
  if (auth) {
    chrome.alarms.create("presence-ping", { periodInMinutes: 0.25 });
  }
});
chrome.runtime.onStartup.addListener(async () => {
  const auth = await getAuth();
  if (auth) {
    chrome.alarms.create("presence-ping", { periodInMinutes: 0.25 });
  }
});
