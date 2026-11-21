const $ = (selector) => document.querySelector(selector);
const elements = {
  gate: $("#gate"), claimPanel: $("#claim-panel"), loginPanel: $("#login-panel"), claim: $("#claim-button"),
  login: $("#login-panel"), keyInput: $("#key-input"), loginError: $("#login-error"), workspace: $("#workspace"),
  appActions: $("#app-actions"), clipboardForm: $("#clipboard-form"), clipboardInput: $("#clipboard-input"),
  textCounter: $("#text-counter"), paste: $("#paste-button"), clipList: $("#clip-list"), clipsEmpty: $("#clips-empty"), clipCount: $("#clip-count"),
  dropZone: $("#drop-zone"), fileInput: $("#file-input"), chooseFiles: $("#choose-files"), uploadProgress: $("#upload-progress"),
  fileList: $("#file-list"), filesEmpty: $("#files-empty"), fileCount: $("#file-count"),
  pairButton: $("#pair-button"), pairDialog: $("#pair-dialog"), closePair: $("#close-pair"), qr: $("#qr-image"), pairKey: $("#pair-key"),
  copyKey: $("#copy-key"), rotateKey: $("#rotate-key"), toast: $("#toast"), host: $("#host-label"),
};

let key = localStorage.getItem("chuyen.key") || "";
let refreshTimer;
const queryKey = new URL(location.href).searchParams.get("key");
if (queryKey) {
  key = queryKey;
  localStorage.setItem("chuyen.key", key);
  history.replaceState(null, "", location.pathname);
}

elements.host.textContent = location.host;

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (key) headers.set("Authorization", `Bearer ${key}`);
  if (options.body && typeof options.body === "object" && !(options.body instanceof Blob)) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, { ...options, headers });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast("Copied to clipboard");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function fileExtension(name) {
  const part = name.split(".").pop();
  return part && part !== name ? part.slice(0, 4) : "file";
}

function renderClips(clips) {
  elements.clipList.replaceChildren();
  elements.clipsEmpty.hidden = clips.length > 0;
  elements.clipCount.textContent = `${clips.length} items`;
  for (const clip of clips) {
    const item = document.createElement("li");
    item.className = "clip-item";
    item.dataset.id = clip.id;
    const text = document.createElement("p");
    text.className = "clip-text";
    text.textContent = clip.text;
    const meta = document.createElement("div");
    meta.className = "item-meta";
    const time = document.createElement("span");
    time.textContent = formatDate(clip.createdAt);
    const actions = document.createElement("div");
    actions.className = "item-actions";
    const copy = document.createElement("button");
    copy.className = "mini-button";
    copy.type = "button";
    copy.dataset.copy = "true";
    copy.textContent = "Copy";
    const remove = document.createElement("button");
    remove.className = "mini-button";
    remove.type = "button";
    remove.dataset.delete = "true";
    remove.textContent = "Delete";
    actions.append(copy, remove);
    meta.append(time, actions);
    item.append(text, meta);
    elements.clipList.append(item);
  }
}

function renderFiles(files) {
  elements.fileList.replaceChildren();
  elements.filesEmpty.hidden = files.length > 0;
  elements.fileCount.textContent = `${files.length} files`;
  for (const file of files) {
    const item = document.createElement("li");
    item.className = "file-item";
    item.dataset.id = file.id;
    const mark = document.createElement("span");
    mark.className = "file-mark";
    mark.textContent = fileExtension(file.name);
    const copy = document.createElement("div");
    copy.className = "file-copy";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const detail = document.createElement("span");
    detail.textContent = `${formatBytes(file.size)} · ${formatDate(file.createdAt)}`;
    copy.append(name, detail);
    const actions = document.createElement("div");
    actions.className = "file-actions";
    const download = document.createElement("button");
    download.className = "mini-button";
    download.type = "button";
    download.dataset.download = "true";
    download.textContent = "Download";
    const remove = document.createElement("button");
    remove.className = "mini-button";
    remove.type = "button";
    remove.dataset.delete = "true";
    remove.textContent = "Delete";
    actions.append(download, remove);
    item.append(mark, copy, actions);
    elements.fileList.append(item);
  }
}

async function refresh() {
  try {
    const state = await api("/api/state");
    renderClips(state.clips);
    renderFiles(state.files);
  } catch (error) {
    if (error.message.includes("not paired")) showGate(true);
  }
}

function showWorkspace() {
  elements.gate.hidden = true;
  elements.workspace.hidden = false;
  elements.appActions.hidden = false;
  clearInterval(refreshTimer);
  refresh();
  refreshTimer = setInterval(refresh, 3000);
}

function showGate(claimed) {
  elements.gate.hidden = false;
  elements.workspace.hidden = true;
  elements.appActions.hidden = true;
  elements.claimPanel.hidden = claimed;
  elements.loginPanel.hidden = !claimed;
  clearInterval(refreshTimer);
}

async function initialize() {
  const status = await api("/api/status");
  if (key && status.claimed) {
    try {
      await api("/api/state");
      return showWorkspace();
    } catch {
      key = "";
      localStorage.removeItem("chuyen.key");
    }
  }
  showGate(status.claimed);
}

async function uploadFile(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} exceeds 25 MB`);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/files?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${key}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) elements.uploadProgress.querySelector("i").style.width = `${event.loaded / event.total * 100}%`;
    };
    xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText).error || "Upload failed"));
    xhr.onerror = () => reject(new Error("Connection lost during upload"));
    xhr.send(file);
  });
}

async function uploadFiles(files) {
  if (!files.length) return;
  elements.uploadProgress.hidden = false;
  try {
    for (const file of files) {
      elements.uploadProgress.querySelector("span").textContent = `Uploading ${file.name}…`;
      elements.uploadProgress.querySelector("i").style.width = "0";
      await uploadFile(file);
    }
    toast("Files sent over LAN");
    await refresh();
  } catch (error) {
    toast(error.message);
  } finally {
    elements.uploadProgress.hidden = true;
    elements.fileInput.value = "";
  }
}

async function openPairDialog() {
  const result = await api("/api/qr", { method: "POST", body: { origin: location.origin } });
  elements.qr.src = result.image;
  elements.pairKey.textContent = key;
  elements.pairDialog.showModal();
}

elements.claim.addEventListener("click", async () => {
  try {
    const result = await api("/api/claim", { method: "POST" });
    key = result.key;
    localStorage.setItem("chuyen.key", key);
    showWorkspace();
    await openPairDialog();
  } catch (error) { toast(error.message); }
});
elements.login.addEventListener("submit", async (event) => {
  event.preventDefault();
  key = elements.keyInput.value.trim();
  try {
    await api("/api/state");
    localStorage.setItem("chuyen.key", key);
    elements.loginError.textContent = "";
    showWorkspace();
  } catch (error) {
    key = "";
    elements.loginError.textContent = error.message;
  }
});
elements.clipboardInput.addEventListener("input", () => { elements.textCounter.textContent = `${elements.clipboardInput.value.length} / 8000`; });
elements.clipboardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/clipboard", { method: "POST", body: { text: elements.clipboardInput.value } });
    elements.clipboardInput.value = "";
    elements.textCounter.textContent = "0 / 8000";
    toast("Sent to shared clipboard");
    await refresh();
  } catch (error) { toast(error.message); }
});
elements.paste.addEventListener("click", async () => {
  try { elements.clipboardInput.value = await navigator.clipboard.readText(); elements.clipboardInput.dispatchEvent(new Event("input")); }
  catch { toast("The browser cannot read the clipboard over HTTP"); }
});
elements.clipList.addEventListener("click", async (event) => {
  const item = event.target.closest(".clip-item");
  if (!item) return;
  if (event.target.matches("[data-copy]")) return copyText(item.querySelector(".clip-text").textContent);
  if (event.target.matches("[data-delete]")) { await api(`/api/clipboard/${item.dataset.id}`, { method: "DELETE" }); await refresh(); }
});
elements.chooseFiles.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => uploadFiles([...elements.fileInput.files]));
for (const name of ["dragenter", "dragover"]) elements.dropZone.addEventListener(name, (event) => { event.preventDefault(); elements.dropZone.classList.add("dragging"); });
for (const name of ["dragleave", "drop"]) elements.dropZone.addEventListener(name, (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragging"); });
elements.dropZone.addEventListener("drop", (event) => uploadFiles([...event.dataTransfer.files]));
elements.fileList.addEventListener("click", async (event) => {
  const item = event.target.closest(".file-item");
  if (!item) return;
  if (event.target.matches("[data-delete]")) { await api(`/files/${item.dataset.id}`, { method: "DELETE" }); return refresh(); }
  if (event.target.matches("[data-download]")) {
    const response = await fetch(`/files/${item.dataset.id}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) return toast("Could not download file");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = item.querySelector(".file-copy strong").textContent;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
elements.pairButton.addEventListener("click", openPairDialog);
elements.closePair.addEventListener("click", () => elements.pairDialog.close());
elements.copyKey.addEventListener("click", () => copyText(key));
elements.rotateKey.addEventListener("click", async () => {
  const result = await api("/api/rotate-key", { method: "POST" });
  key = result.key;
  localStorage.setItem("chuyen.key", key);
  await openPairDialog();
  toast("Pairing key changed");
});

initialize().catch(() => showGate(false));
