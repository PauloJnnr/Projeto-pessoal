const SITE_URL = window.piw.siteUrl;
const MAX_TABS = 4;
const STORAGE_KEY = 'piw-client-tabs';

const tabList = document.querySelector('#tab-list');
const emptyState = document.querySelector('#empty-state');
const statusText = document.querySelector('#status-text');
const addTabButton = document.querySelector('#add-tab');
const views = [...document.querySelectorAll('.game-view')];
const updateToast = document.querySelector('#update-toast');
const updateMessage = document.querySelector('#update-message');
const tabs = loadTabs();
let activeId = null;

function loadTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.slice(0, MAX_TABS).map((tab, index) => ({
      id: tab.id || `slot-${index}`,
      slot: Number.isInteger(tab.slot) ? tab.slot : index,
      name: tab.name || `Conta ${index + 1}`,
      info: tab.info || {}
    }));
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
  view.src = SITE_URL;
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

function captureCredentials(view, tab) {
  const capture = () => view.executeJavaScript(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const user = inputs.find((input) => /email|usu[aá]rio|username/i.test(input.name + ' ' + input.placeholder));
    const password = inputs.find((input) => input.type === 'password');
    return { username: user?.value || '', password: password?.value || '' };
  })()`).then((credentials) => {
    if (credentials?.username && credentials?.password) {
      window.piw.saveCredentials(tab.slot, credentials);
    }
  }).catch(() => {});
  clearInterval(tab.credentialsTimer);
  tab.credentialsTimer = setInterval(capture, 1000);
}

async function restoreCredentials(view, tab) {
  const credentials = await window.piw.loadCredentials(tab.slot);
  if (!credentials) return;
  const fields = await view.executeJavaScript(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const user = inputs.find((input) => /email|usu[aá]rio|username/i.test(input.name + ' ' + input.placeholder));
    const password = inputs.find((input) => input.type === 'password');
    return { user: user?.name || user?.id || '', password: password?.name || password?.id || '' };
  })()`);
  if (!fields?.user || !fields?.password) return;
  await view.executeJavaScript(`(() => {
    const user = document.querySelector('#${fields.user}, [name="${fields.user}"]');
    const password = document.querySelector('#${fields.password}, [name="${fields.password}"]');
    if (user) { user.value = ${JSON.stringify(credentials.username)}; user.dispatchEvent(new Event('input', { bubbles: true })); }
    if (password) { password.value = ${JSON.stringify(credentials.password)}; password.dispatchEvent(new Event('input', { bubbles: true })); }
  })()`);
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
    const balls = resourceText.match(/(?:balls?|pok[eé]bolas?)[^|]{0,40}/i)?.[0]?.trim() || '';
    const potions = resourceText.match(/(?:potions?|po[cç][oõ]es?)[^|]{0,40}/i)?.[0]?.trim() || '';
    const analyzerOpen = /HUNT ANALYZER|SALDO \\(LOOT|DROPS DA SESSÃO/i.test(text);
    return {
      name: name && !/^Conta \\d+$/i.test(name) ? name : '',
      level: levelMatch?.[1] || '',
      hunt: (levelLine.split(/[·|]/).pop() || '').trim(),
      gold: valueFor('Gold\\/h'),
      xp: valueFor('XP\\/h'),
      captured: valueFor('Capturados'),
      kills: valueFor('Kills\\/h'),
      balls,
      potions,
      analyzerOpen,
      resources: [balls, potions, resources].filter(Boolean).join(' | ')
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
    tabButton.innerHTML = `<span class="tab-dot"></span><span class="tab-name"></span><span class="tab-detail"></span>${analyzer}<div class="tab-resources"><span>${info.balls || 'Balls: —'}</span><span>${info.potions || 'Poções: —'}</span></div><div class="tab-metrics"><span class="tab-metric">${info.gold || '—'} Gold/h</span><span class="tab-metric">${info.xp || '—'} XP/h</span><span class="tab-metric">${info.captured || '—'} Capturados</span><span class="tab-metric">${info.kills || '—'} Kills/h</span></div><button class="close-tab" title="Fechar conta" aria-label="Fechar conta">×</button>`;
    tabButton.querySelector('.tab-name').textContent = tab.name;
    tabButton.querySelector('.tab-detail').textContent = detail;
    tabButton.addEventListener('click', (event) => {
      if (!event.target.closest('.close-tab')) activateTab(tab.id);
    });
    tabButton.addEventListener('dblclick', () => renameTab(tab));
    tabButton.querySelector('.close-tab').addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    tabList.append(tabButton);
  });
  addTabButton.disabled = tabs.length >= MAX_TABS;
  emptyState.hidden = tabs.length > 0;
  const activeTab = tabs.find((tab) => tab.id === activeId);
  views.forEach((view) => view.classList.toggle('active', view.dataset.slot === String(activeTab?.slot)));
}

function addTab() {
  if (tabs.length >= MAX_TABS) return;
  const usedSlots = new Set(tabs.map((tab) => tab.slot));
  const slot = views.findIndex((_view, index) => !usedSlots.has(index));
  const tab = { id: `slot-${slot}`, slot, name: `Conta ${tabs.length + 1}` };
  tabs.push(tab);
  connectView(tab);
  saveTabs();
  activateTab(tab.id);
}

function activateTab(id) {
  activeId = id;
  const tab = tabs.find((item) => item.id === id);
  if (tab) {
    connectView(tab);
    setStatus(`Conta: ${tab.name}`);
  }
  render();
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

addTabButton.addEventListener('click', addTab);

if (tabs.length === 0) tabs.push({ id: 'slot-0', slot: 0, name: 'Conta 1' });
saveTabs();
tabs.forEach(connectView);
activateTab(tabs[0].id);
