const SITE_URL = window.piw.siteUrl;
const MAX_TABS = 4;
const STORAGE_KEY = 'piw-client-tabs';

const tabList = document.querySelector('#tab-list');
const emptyState = document.querySelector('#empty-state');
const statusText = document.querySelector('#status-text');
const views = [...document.querySelectorAll('.game-view')];
const updateToast = document.querySelector('#update-toast');
const updateMessage = document.querySelector('#update-message');
const credentialsDialog = document.querySelector('#credentials-dialog');
const credentialsForm = document.querySelector('#credentials-form');
const credentialsUsername = document.querySelector('#credentials-username');
const credentialsPassword = document.querySelector('#credentials-password');
const credentialsSlot = document.querySelector('#credentials-slot');
const tabs = loadTabs();
let activeId = null;
let credentialsTab = null;

window.addEventListener('error', (event) => {
  console.error('Erro na interface:', event.error || event.message);
  setStatus('Erro na interface: recarregue o cliente');
});

function loadTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const list = Array.isArray(saved) ? saved : [];
    return Array.from({ length: MAX_TABS }, (_value, index) => {
      const tab = list.find((item) => item?.slot === index) || {};
      return { id: `slot-${index}`, slot: index, name: tab.name || `Conta ${index + 1}`, info: tab.info || {} };
    });
  } catch {
    return [];
  }
}

function saveTabs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.map(({ id, slot, name, info }) => ({ id, slot, name, info }))));
}

function setStatus(message) {
  statusText.textContent = message;
}

async function openCredentials(tab) {
  credentialsTab = tab;
  const saved = await window.piw.loadCredentials(tab.slot);
  credentialsSlot.textContent = tab.name;
  credentialsUsername.value = saved?.username || '';
  credentialsPassword.value = saved?.password || '';
  credentialsDialog.showModal();
}

credentialsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!credentialsTab) return;
  await window.piw.saveCredentials(credentialsTab.slot, {
    username: credentialsUsername.value.trim(),
    password: credentialsPassword.value
  });
  const view = getView(credentialsTab);
  view?.reload();
  credentialsDialog.close();
  setStatus(`Credenciais salvas: ${credentialsTab.name}`);
});

window.piw.onUpdateStatus((status) => {
  const messages = {
    checking: 'Verificando atualizações...',
    available: `Nova versão ${status.version} encontrada. Baixando...`,
    downloading: `Baixando atualização: ${status.percent}%`,
    downloaded: `Versão ${status.version} pronta para instalar ao reiniciar.`,
    error: 'Não foi possível verificar atualizações.'
  };
  updateMessage.textContent = messages[status.state] || 'Atualização do cliente';
  updateToast.hidden = status.state === 'checking' || status.state === 'error';
});

function getView(tab) {
  return views.find((view) => Number(view.dataset.slot) === tab.slot);
}

function connectView(tab) {
  const view = getView(tab);
  if (!view || view.dataset.connected === 'true') return view;
  view.dataset.connected = 'true';
  try {
    view.src = SITE_URL;
  } catch (error) {
    view.dataset.connected = 'false';
    tab.info = { ...tab.info, error: 'Falha ao abrir a sessão' };
    setStatus('Falha ao abrir a sessão da conta');
    console.error('Falha ao conectar guia:', error);
    return view;
  }
  view.addEventListener('dom-ready', () => {
    restoreCredentials(view, tab);
    startPlayerInfoReader(view, tab);
    captureCredentials(view, tab);
  });
  view.addEventListener('did-start-loading', () => {
    if (activeId === tab.id) setStatus('Carregando o login...');
  });
  view.addEventListener('did-stop-loading', () => {
    if (activeId === tab.id) setStatus(`Conta: ${tab.name}`);
  });
  view.addEventListener('page-title-updated', (event) => {
    const title = event.title.trim();
    if (title && !/^Poke Idle World$/i.test(title) && !/^Login/i.test(title)) {
      tab.name = title.replace(/\s*[|–-].*$/, '').trim().slice(0, 28) || tab.name;
      saveTabs();
      render();
    }
  });
  view.addEventListener('did-fail-load', () => {
    if (activeId === tab.id) setStatus('Não foi possível carregar o login');
  });
  return view;
}

function applyPageText(tab, text) {
  const lines = String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const levelIndex = lines.findIndex((line) => /\bLv\.?\s*\d+/i.test(line));
  if (levelIndex < 1) return;
  const levelLine = lines[levelIndex];
  const level = levelLine.match(/\bLv\.?\s*(\d+)/i)?.[1] || '';
  const name = lines[levelIndex - 1].replace(/^[^A-Za-zÀ-ÿ0-9_]*/, '').trim();
  const hunt = (levelLine.split(/[·|]/).pop() || '').trim();
  if (name && !/^Conta \d+$/i.test(name)) tab.name = name.slice(0, 28);
  tab.info = { ...tab.info, level, hunt, analyzerOpen: /HUNT ANALYZER|SALDO \(LOOT|DROPS DA SESSÃO/i.test(text) };
  saveTabs();
  render();
}

function applyNetworkData(tab, payload) {
  try {
    const text = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
    const pick = (patterns) => patterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean) || '';
    const info = {
      ...tab.info,
      name: pick([/"(?:characterName|playerName|trainerName|username)"\s*:\s*"([^"]+)/i]) || tab.name,
      level: pick([/"(?:level|playerLevel)"\s*:\s*(\d+)/i]) || tab.info?.level || '',
      hunt: pick([/"(?:currentHunt|huntName|hunt|location)"\s*:\s*"([^"]+)/i]) || tab.info?.hunt || '',
      gold: pick([/"(?:goldPerHour|gold_hour)"\s*:\s*([\d.,]+)/i]) || tab.info?.gold || '',
      xp: pick([/"(?:xpPerHour|xp_hour)"\s*:\s*([\d.,]+)/i]) || tab.info?.xp || '',
      captured: pick([/"(?:captured|captures)"\s*:\s*([\d.,]+)/i]) || tab.info?.captured || '',
      kills: pick([/"(?:killsPerHour|kills_hour)"\s*:\s*([\d.,]+)/i]) || tab.info?.kills || ''
    };
    if (info.name && !/^Conta \d+$/i.test(info.name)) tab.name = info.name.slice(0, 28);
    tab.info = info;
    saveTabs();
    render();
  } catch {}
}

function captureCredentials(view, tab) {
  const capture = () => view.executeJavaScript(`(() => {
    const captured = window.__piwCredentialValues || {};
    const inputs = [...document.querySelectorAll('input')];
    const user = document.querySelector('input[autocomplete="username"]') || inputs.find((input) => /email|usu[aá]rio|username|login/i.test(input.name + ' ' + input.id + ' ' + input.placeholder)) || inputs.find((input) => input.type !== 'password');
    const password = document.querySelector('input[autocomplete="current-password"]') || inputs.find((input) => input.type === 'password');
    return { username: captured.username || user?.value?.trim() || '', password: captured.password || password?.value || '' };
  })()`).then((credentials) => {
    if (credentials?.username && credentials?.password) return window.piw.saveCredentials(tab.slot, credentials);
    return false;
  }).catch(() => false);
  clearInterval(tab.credentialsTimer);
  capture();
  tab.credentialsTimer = setInterval(capture, 250);
  view.executeJavaScript(`(() => {
    if (window.__piwCredentialCapture) return;
    window.__piwCredentialCapture = true;
    const save = () => {
      const inputs = [...document.querySelectorAll('input')];
      const user = document.querySelector('input[autocomplete="username"]') || inputs.find((input) => /email|usu[aá]rio|username|login/i.test(input.name + ' ' + input.id + ' ' + input.placeholder)) || inputs.find((input) => input.type !== 'password');
      const password = document.querySelector('input[autocomplete="current-password"]') || inputs.find((input) => input.type === 'password');
      window.__piwCredentialValues = { username: user?.value?.trim() || '', password: password?.value || '' };
    };
    document.addEventListener('input', save, true);
    document.addEventListener('change', save, true);
    document.addEventListener('submit', save, true);
    save();
  })()`).catch(() => {});
}

async function restoreCredentials(view, tab) {
  const credentials = await window.piw.loadCredentials(tab.slot);
  if (!credentials) return;
  const serialized = JSON.stringify(credentials);
  const fill = () => view.executeJavaScript(`(() => {
    const credentials = ${serialized};
    const inputs = [...document.querySelectorAll('input')];
    const user = document.querySelector('input[autocomplete="username"]') || inputs.find((input) => /email|usu[aá]rio|username|login/i.test(input.name + ' ' + input.id + ' ' + input.placeholder)) || inputs.find((input) => input.type !== 'password');
    const password = document.querySelector('input[autocomplete="current-password"]') || inputs.find((input) => input.type === 'password');
    const setValue = (element, value) => {
      if (!element) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue(user, credentials.username);
    setValue(password, credentials.password);
    return Boolean(user && password);
  })()`).catch(() => false);
  await fill();
  clearInterval(tab.restoreTimer);
  let attempts = 0;
  tab.restoreTimer = setInterval(() => {
    attempts += 1;
    fill();
    if (attempts >= 12) clearInterval(tab.restoreTimer);
  }, 1000);
}

function startPlayerInfoReader(view, tab) {
  const read = () => view.executeJavaScript(`(() => {
    const visible = (node) => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const nodes = [];
    const walk = (root) => {
      for (const node of root.querySelectorAll ? root.querySelectorAll('*') : []) {
        if (visible(node)) nodes.push(node);
        if (node.shadowRoot) walk(node.shadowRoot);
      }
    };
    walk(document);
    const textNodes = nodes.filter((node) => !node.children.length).map((node) => (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
    const text = textNodes.join(' | ');
    const bodyText = textNodes.join('\\n');
    const lines = bodyText.split(/\\n+/).map((line) => line.trim()).filter(Boolean);
    const levelLine = lines.find((line) => /\\bLv\\.?\\s*\\d+/i.test(line)) || '';
    const levelMatch = levelLine.match(/\\bLv\\.?\\s*(\\d+)/i);
    const levelIndex = lines.indexOf(levelLine);
    const name = levelIndex > 0 ? lines[levelIndex - 1].replace(/^[^A-Za-zÀ-ÿ0-9_]*/, '').trim() : '';
    const valueFor = (label) => {
      const index = lines.findIndex((line) => new RegExp(label, 'i').test(line));
      if (index > 0 && /[\\d.,]/.test(lines[index - 1])) return lines[index - 1].match(/[\\d.,]+/)?.[0] || '';
      const match = text.match(new RegExp('([\\d.,]+)\\s*(?:[^|]{0,20})' + label, 'i'));
      return match?.[1] || '';
    };
    const tooltips = [...document.querySelectorAll('[title], [aria-label], [data-tooltip], img[alt]')].map((node) => {
      const label = node.getAttribute('title') || node.getAttribute('aria-label') || node.getAttribute('data-tooltip') || node.getAttribute('alt') || '';
      return label + ' ' + (node.parentElement?.innerText || '').replace(/\\s+/g, ' ');
    }).join(' | ');
    const resourceText = text + ' | ' + tooltips;
    const runtimeParts = [];
    const addRuntime = (key, value) => {
      if (value === null || value === undefined || typeof value === 'function') return;
      let normalized = '';
      try { normalized = typeof value === 'object' ? JSON.stringify(value) : String(value); } catch { normalized = '[object]'; }
      if (normalized && normalized.length < 300) runtimeParts.push(key + ': ' + normalized);
    };
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) || '';
        if (/player|character|trainer|username|level|hunt|analyzer|gold|xp|ball|potion/i.test(key)) addRuntime(key, storage.getItem(key));
      }
    }
    const visited = new Set();
    const scan = (object, prefix, depth) => {
      if (!object || depth > 3 || visited.has(object)) return;
      visited.add(object);
      for (const key of Object.keys(object).slice(0, 120)) {
        if (!/player|character|trainer|username|level|hunt|analyzer|gold|xp|ball|potion|capture|kill/i.test(key)) continue;
        try {
          const value = object[key];
          addRuntime(prefix + key, value);
          if (value && typeof value === 'object') scan(value, prefix + key + '.', depth + 1);
        } catch {}
      }
    };
    scan(window, 'window.', 0);
    for (const node of nodes.slice(0, 600)) {
      for (const key of Object.keys(node)) {
        if (/react|fiber|props|state/i.test(key)) {
          try { scan(node[key], 'dom.' + key + '.', 0); } catch {}
        }
      }
    }
    const runtimeText = runtimeParts.join(' | ');
    const source = text + ' | ' + runtimeText;
    const balls = resourceText.match(/(?:balls?|pok[eé]bolas?)[^|]{0,40}/i)?.[0]?.trim() || '';
    const potions = resourceText.match(/(?:potions?|po[cç][oõ]es?)[^|]{0,40}/i)?.[0]?.trim() || '';
    const analyzerOpen = /HUNT ANALYZER|SALDO \\(LOOT|DROPS DA SESSÃO/i.test(text);
    return {
      name: name && !/^Conta \\d+$/i.test(name) ? name : source.match(/(?:characterName|playerName|trainerName|username)\\s*[:=]\\s*["']([^"']+)/i)?.[1] || '',
      level: levelMatch?.[1] || source.match(/(?:level|playerLevel)\\s*[:=]\\s*["']?(\\d+)/i)?.[1] || '',
      hunt: (levelLine.split(/[·|]/).pop() || source.match(/(?:currentHunt|huntName|hunt)\\s*[:=]\\s*["']([^"']+)/i)?.[1] || '').trim(),
      gold: valueFor('Gold\\/h') || source.match(/(?:goldPerHour|gold_hour)\\s*[:=]\\s*["']?([\\d.,]+)/i)?.[1] || '',
      xp: valueFor('XP\\/h') || source.match(/(?:xpPerHour|xp_hour)\\s*[:=]\\s*["']?([\\d.,]+)/i)?.[1] || '',
      captured: valueFor('Capturados') || source.match(/(?:captured|captures)\\s*[:=]\\s*["']?([\\d.,]+)/i)?.[1] || '',
      kills: valueFor('Kills\\/h') || source.match(/(?:killsPerHour|kills_hour)\\s*[:=]\\s*["']?([\\d.,]+)/i)?.[1] || '',
      balls,
      potions,
      analyzerOpen,
      resources: [balls, potions, runtimeText].filter(Boolean).join(' | ')
    };
  })()`);
  read.then((info) => {
    if (info.name) tab.name = info.name.slice(0, 28);
    tab.info = info;
    saveTabs();
    render();
  }).catch(() => {});
  clearInterval(tab.infoTimer);
  tab.infoTimer = setInterval(read, 3000);
}

function render() {
  tabList.replaceChildren();
  tabs.forEach((tab) => {
    const tabButton = document.createElement('div');
    tabButton.className = `tab${tab.id === activeId ? ' active' : ''}`;
    tabButton.dataset.id = tab.id;
    tabButton.title = tab.info?.resources || 'Duplo clique para renomear';
    const info = tab.info || {};
    const detail = info.level ? `Lv. ${info.level}${info.hunt ? ` · ${info.hunt}` : ''}` : 'Aguardando personagem';
    const analyzer = info.analyzerOpen ? `<div class="analyzer-state analyzer-ready">Hunt: ${info.hunt || 'em andamento'}</div>` : '<div class="analyzer-state">ABRA O ANALYZER PARA INFORMAÇÕES</div>';
    tabButton.innerHTML = `<span class="tab-dot"></span><span class="tab-name"></span><button class="credentials-button" title="Configurar login" aria-label="Configurar login" onclick="event.stopPropagation(); window.openPIWCredentials(${tab.slot})">Login</button><span class="tab-detail"></span>${analyzer}<div class="tab-resources"><span>${info.balls || 'Balls: —'}</span><span>${info.potions || 'Poções: —'}</span></div><div class="tab-metrics"><span class="tab-metric">${info.gold || '—'} Gold/h</span><span class="tab-metric">${info.xp || '—'} XP/h</span><span class="tab-metric">${info.captured || '—'} Capturados</span><span class="tab-metric">${info.kills || '—'} Kills/h</span></div>`;
    tabButton.querySelector('.tab-name').textContent = tab.name;
    tabButton.querySelector('.tab-detail').textContent = detail;
    tabButton.addEventListener('click', (event) => {
      if (!event.target.closest('.close-tab')) activateTab(tab.id);
    });
    tabButton.addEventListener('dblclick', () => renameTab(tab));
    tabList.append(tabButton);
  });
  emptyState.hidden = tabs.length > 0;
  const activeTab = tabs.find((tab) => tab.id === activeId);
  views.forEach((view) => view.classList.toggle('active', view.dataset.slot === String(activeTab?.slot)));
}

function activateTab(id) {
  activeId = id;
  const tab = tabs.find((item) => item.id === id);
  if (tab) {
    setStatus(`Conta: ${tab.name}`);
  }
  render();
  if (tab) connectView(tab);
}

function renameTab(tab) {
  const name = window.prompt('Nome da conta:', tab.name);
  if (name === null) return;
  tab.name = name.trim() || tab.name;
  saveTabs();
  render();
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;
  const closedTab = tabs[index];
  const view = getView(closedTab);
  clearInterval(closedTab.infoTimer);
  clearInterval(closedTab.credentialsTimer);
  clearInterval(closedTab.restoreTimer);
  if (view) {
    view.removeAttribute('src');
    view.dataset.connected = 'false';
  }
  tabs.splice(index, 1);
  if (activeId === id) activeId = tabs[index]?.id || tabs[index - 1]?.id || null;
  saveTabs();
  render();
  if (activeId) activateTab(activeId);
  else setStatus('Pronto para conectar');
}

function activeView() {
  const tab = tabs.find((item) => item.id === activeId);
  return tab ? getView(tab) : null;
}

saveTabs();
render();
tabs.forEach(connectView);
activateTab(tabs[0].id);
