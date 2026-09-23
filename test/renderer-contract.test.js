const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const renderer = fs.readFileSync('src/renderer.js', 'utf8');
const index = fs.readFileSync('src/index.html', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('captura credenciais digitadas e recupera valores capturados', () => {
  assert.match(renderer, /window\.__piwCredentialValues/);
  assert.match(renderer, /window\.piw\.saveCredentials\(tab\.slot, credentials\)/);
  assert.match(renderer, /setInterval\(capture, 250\)/);
});

test('leitor consulta DOM, storage e estado React/runtime', () => {
  assert.match(renderer, /localStorage, sessionStorage/);
  assert.match(renderer, /scan\(window, 'window\.', 0\)/);
  assert.match(renderer, /scan\(node\[key\], 'dom\.'/);
  assert.match(renderer, /characterName\|playerName\|trainerName/);
  assert.doesNotMatch(renderer, /resources: \[balls, potions, resources\]/);
});

test('cliente usa quatro sessoes persistentes', () => {
  assert.equal((index.match(/partition="persist:piw-slot-/g) || []).length, 4);
  assert.match(renderer, /MAX_TABS = 4/);
  assert.equal((index.match(/switchPIWTab\(/g) || []).length, 4);
});

test('identificacao compacta fica na barra nativa', () => {
  assert.doesNotMatch(index, /class="topbar"/);
  assert.match(fs.readFileSync('src/main.js', 'utf8'), /PIW Client v\$\{app\.getVersion\(\)\}/);
});

test('updater e versao de release estao configurados', () => {
  assert.equal(packageJson.dependencies['electron-updater'], '^6.6.2');
  assert.equal(packageJson.build.publish.provider, 'github');
  assert.ok(packageJson.version);
});

test('captura de dados nao bloqueia a navegacao da webview', () => {
  assert.doesNotMatch(renderer, /view\.setAttribute\('preload'/);
  assert.match(renderer, /view\.src = SITE_URL/);
});
