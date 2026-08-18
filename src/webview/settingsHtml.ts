import { API_FORMAT_OPTIONS, CONTEXT_DEFAULTS } from '../constants';

/**
 * 生成设置面板的 HTML(内联 CSS/JS,CSP 使用 nonce)。
 * 界面数据全部通过 postMessage 传递,不插值进 HTML,避免注入问题;
 * 仅注入静态的 API 格式选项与默认上下文(扩展内常量,内容可信)。
 */
export function getSettingsHtml(nonce: string): string {
  const formatsJson = JSON.stringify(API_FORMAT_OPTIONS).replace(/</g, '\\u003c');
  const defaultContextSize = CONTEXT_DEFAULTS.CONTEXT_SIZE;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Git Scribe 设置</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  #sidebar {
    width: 220px;
    min-width: 220px;
    border-right: 1px solid var(--vscode-panel-border, #3c3c3c);
    display: flex;
    flex-direction: column;
    padding: 12px 0;
  }
  .sidebar-section-title {
    padding: 4px 16px 8px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .provider-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 16px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    text-align: left;
    width: 100%;
    font-size: 13px;
  }
  .provider-item:hover { background: var(--vscode-list-hoverBackground); }
  .provider-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .provider-item .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.ok { background: #4caf50; }
  .dot.missing { background: var(--vscode-descriptionForeground); }
  .provider-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-active {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  #addProviderBtn {
    margin: 10px 16px;
    padding: 7px 10px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
    cursor: pointer;
    font-size: 13px;
    text-align: center;
  }
  #addProviderBtn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  #sidebarFooter {
    margin-top: auto;
    padding: 12px 16px 8px;
    border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
    font-size: 12px;
  }
  #sidebarFooter .row { margin-bottom: 8px; }
  #sidebarFooter label { display: block; color: var(--vscode-descriptionForeground); margin-bottom: 3px; font-size: 11px; }
  #sidebarFooter select {
    width: 100%;
    padding: 5px 6px;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 2px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 12px;
    outline: none;
  }
  #sidebarFooter select:focus { border-color: var(--vscode-focusBorder); }
  #sidebarFooter select:disabled { opacity: 0.55; }
  .nav-item {
    display: block;
    width: 100%;
    padding: 7px 16px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    text-align: left;
    font-size: 13px;
    cursor: pointer;
  }
  .nav-item:hover { background: var(--vscode-list-hoverBackground); }
  .nav-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  #main { flex: 1; overflow-y: auto; padding: 20px 28px; }
  h2 { margin: 0 0 4px; font-size: 16px; }
  .desc { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 18px; }
  .field { margin-bottom: 14px; max-width: 560px; }
  .field label { display: block; margin-bottom: 5px; font-size: 12px; }
  input[type=text], input[type=password], select {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 2px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 13px;
    outline: none;
  }
  input:focus, select:focus { border-color: var(--vscode-focusBorder); }
  #modelChips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 10px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 12px;
  }
  .chip.active { outline: 1px solid #4caf50; }
  .chip-meta { font-size: 10px; opacity: 0.9; }
  .chip .remove {
    border: none; background: transparent; cursor: pointer;
    color: inherit; font-size: 13px; padding: 0; line-height: 1;
  }
  #modelAddRow { display: flex; gap: 6px; max-width: 560px; flex-wrap: wrap; align-items: center; }
  #modelAddRow input { flex: 1; min-width: 120px; }
  #modelContextInput { max-width: 150px; }
  #modelAddHint {
    width: 100%;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
  }
  .btn-row { display: flex; gap: 8px; margin-top: 18px; align-items: center; flex-wrap: wrap; }
  button.primary {
    padding: 7px 16px; border: none; border-radius: 2px; cursor: pointer; font-size: 13px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    padding: 7px 14px; border: none; border-radius: 2px; cursor: pointer; font-size: 13px;
    background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #fff);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  button.danger {
    padding: 7px 14px; border: none; border-radius: 2px; cursor: pointer; font-size: 13px;
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: #fff;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  #message { margin-top: 12px; font-size: 12px; min-height: 16px; }
  #message.ok { color: #4caf50; }
  #message.error { color: var(--vscode-errorForeground, #f48771); }
  #empty { color: var(--vscode-descriptionForeground); margin-top: 40px; text-align: center; }
  .hidden { display: none !important; }
  #promptView { max-width: 720px; }
  #promptView textarea {
    width: 100%;
    min-height: 280px;
    padding: 8px 10px;
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 2px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }
  #promptView textarea:focus { border-color: var(--vscode-focusBorder); }
  #promptStatusLabel {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: 6px 0 0;
  }
  #promptMessage { margin-top: 12px; font-size: 12px; min-height: 16px; }
  #promptMessage.ok { color: #4caf50; }
  #promptMessage.error { color: var(--vscode-errorForeground, #f48771); }
  #confirmOverlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .confirm-dialog {
    width: min(420px, calc(100% - 40px));
    padding: 16px 18px;
    border-radius: 6px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border, #3c3c3c));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .confirm-dialog .confirm-text {
    font-size: 13px;
    line-height: 1.55;
    margin-bottom: 16px;
  }
  .confirm-dialog .btn-row {
    margin-top: 0;
    justify-content: flex-end;
  }
</style>
</head>
<body>
  <div id="sidebar">
    <div class="sidebar-section-title">自定义供应商</div>
    <div id="providerList"></div>
    <button id="addProviderBtn">＋ 添加供应商</button>
    <div class="sidebar-section-title" style="margin-top:8px">通用设置</div>
    <button class="nav-item" id="promptNavBtn" type="button">生成设置</button>
    <div id="sidebarFooter">
      <div class="row">
        <label>当前供应商</label>
        <select id="activeProviderSelect">
          <option value="">未配置</option>
        </select>
      </div>
      <div class="row">
        <label>当前模型</label>
        <select id="activeModelSelect" disabled>
          <option value="">未配置</option>
        </select>
      </div>
    </div>
  </div>

  <div id="main">
    <div id="empty">请选择左侧供应商进行编辑,或点击「添加供应商」新建。</div>

    <div id="form" class="hidden">
      <h2 id="formTitle">添加模型供应商</h2>
      <div class="desc">配置 API 端点与模型列表。当前使用的供应商/模型请在左侧底部选择；添加模型不会自动切换当前模型。</div>

      <div class="field">
        <label>名称</label>
        <input type="text" id="nameInput" placeholder="如:智谱 GLM">
      </div>

      <div class="field">
        <label>Base URL</label>
        <input type="text" id="baseUrlInput" placeholder="https://api.example.com/v1">
      </div>

      <div class="field">
        <label>API Key</label>
        <input type="password" id="apiKeyInput" placeholder="输入 API Key">
      </div>

      <div class="field">
        <label>API 格式</label>
        <select id="apiFormatSelect"></select>
      </div>

      <div class="field">
        <label>模型列表</label>
        <div id="modelChips"></div>
        <div id="modelAddRow">
          <input type="text" id="modelInput" placeholder="模型 id,如 deepseek-v4-flash">
          <input type="text" id="modelContextInput" inputmode="numeric" placeholder="上下文 tokens">
          <button class="secondary" id="addModelBtn">＋ 添加模型</button>
        </div>
        <div id="modelAddHint">每个模型单独设置上下文大小，默认 1M tokens。添加后需点「保存修改」。</div>
      </div>

      <div class="btn-row">
        <button type="button" class="primary" id="saveBtn">保存供应商</button>
        <button type="button" class="secondary" id="testBtn">测试连接</button>
        <button type="button" class="danger hidden" id="deleteBtn">删除供应商</button>
      </div>
      <div id="message"></div>
    </div>

    <div id="promptView" class="hidden">
      <h2>生成设置</h2>
      <div class="desc">
        配置提交信息语言与 System Prompt。
        生成时使用此处所选语言；diff 与文件列表仍由插件自动拼入 user 消息。
        各模型的上下文大小请在「模型列表」添加时配置。
      </div>

      <div class="field">
        <label>提交信息语言</label>
        <select id="promptLanguageSelect">
          <option value="zh-CN">中文(简体)</option>
          <option value="en-US">English</option>
        </select>
      </div>

      <div class="field">
        <label>System Prompt</label>
        <textarea id="systemPromptInput" spellcheck="false"></textarea>
        <div id="promptStatusLabel">使用内置默认</div>
      </div>

      <div class="btn-row">
        <button class="primary" id="savePromptBtn">保存</button>
        <button class="secondary" id="resetPromptBtn">恢复默认</button>
      </div>
      <div id="promptMessage"></div>
    </div>
  </div>

  <div id="confirmOverlay" class="hidden" role="dialog" aria-modal="true" aria-labelledby="confirmText">
    <div class="confirm-dialog">
      <div class="confirm-text" id="confirmText"></div>
      <div class="btn-row">
        <button type="button" class="secondary" id="confirmCancel">取消</button>
        <button type="button" class="danger" id="confirmOk">确定</button>
      </div>
    </div>
  </div>

<script nonce="${nonce}">
var API_FORMATS = ${formatsJson};
var DEFAULT_CONTEXT_SIZE = ${defaultContextSize};

var vscode = acquireVsCodeApi();
var state = {
  providers: [],
  activeProviderId: null,
  activeModel: null,
  commitLanguage: 'zh-CN',
  systemPrompts: {},
  systemPromptCustomized: {},
  defaultSystemPrompts: {},
  defaultContextSize: DEFAULT_CONTEXT_SIZE
};
// form.models: [{ id, contextSize }]
var mode = 'empty'; // 'add' | 'edit' | 'empty' | 'prompt'
var form = null;
var testing = false;
var promptLanguage = 'zh-CN';
var promptDirty = false;
var syncingActiveSelects = false;
var confirmOnOk = null;
var confirmOnCancel = null;

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function modelIdOf(m) { return typeof m === 'string' ? m : (m && m.id ? m.id : ''); }
function modelContextOf(m) {
  if (typeof m === 'string') { return DEFAULT_CONTEXT_SIZE; }
  var n = m && m.contextSize;
  return n && n > 0 ? n : DEFAULT_CONTEXT_SIZE;
}
function formatContextSize(n) {
  var v = Number(n) || 0;
  if (v >= 1000000) {
    var m = v / 1000000;
    return (Number.isInteger(m) ? m : m.toFixed(1)) + 'M';
  }
  if (v >= 1000) {
    var k = v / 1000;
    return (Number.isInteger(k) ? k : k.toFixed(1)) + 'K';
  }
  return String(v);
}
function normalizeModels(list) {
  return (list || []).map(function (m) {
    return { id: modelIdOf(m), contextSize: modelContextOf(m) };
  }).filter(function (m) { return m.id; });
}
function findModelIndex(id) {
  for (var i = 0; i < form.models.length; i++) {
    if (form.models[i].id === id) { return i; }
  }
  return -1;
}

function showMessage(text, ok) {
  var m = el('message');
  m.textContent = text || '';
  m.className = ok ? 'ok' : 'error';
  if (!text) { m.className = ''; }
}
function showPromptMessage(text, ok) {
  var m = el('promptMessage');
  m.textContent = text || '';
  m.className = ok ? 'ok' : 'error';
  if (!text) { m.className = ''; }
}
function showMainView(view) {
  el('empty').classList.toggle('hidden', view !== 'empty');
  el('form').classList.toggle('hidden', view !== 'form');
  el('promptView').classList.toggle('hidden', view !== 'prompt');
  el('promptNavBtn').classList.toggle('selected', view === 'prompt');
}

function resolveConfirm(ok) {
  var onOk = confirmOnOk;
  var onCancel = confirmOnCancel;
  confirmOnOk = null;
  confirmOnCancel = null;
  el('confirmOverlay').classList.add('hidden');
  if (ok) {
    if (onOk) { onOk(); }
  } else if (onCancel) {
    onCancel();
  }
}

/** VS Code webview 不支持 window.confirm，用面板内对话框替代。 */
function askConfirm(text, onOk, options) {
  options = options || {};
  confirmOnOk = onOk || null;
  confirmOnCancel = options.onCancel || null;
  el('confirmText').textContent = text;
  el('confirmOk').textContent = options.okText || '确定';
  el('confirmOk').className = options.danger ? 'danger' : 'primary';
  el('confirmOverlay').classList.remove('hidden');
  el('confirmOk').focus();
}

function renderSidebar() {
  var list = el('providerList');
  var html = '';
  state.providers.forEach(function (p) {
    var usable = p.hasApiKey && p.models && p.models.length > 0;
    html += '<button class="provider-item' + (mode !== 'prompt' && form && form.id === p.id ? ' selected' : '') + '" data-id="' + esc(p.id) + '">'
      + '<span class="dot ' + (usable ? 'ok' : 'missing') + '"></span>'
      + '<span class="name">' + esc(p.name) + '</span>'
      + (p.isActive ? '<span class="badge-active">当前</span>' : '')
      + '</button>';
  });
  list.innerHTML = html;
  Array.prototype.forEach.call(list.children, function (child) {
    child.addEventListener('click', function () { selectProvider(child.getAttribute('data-id')); });
  });
  renderActiveSelects();
  el('promptNavBtn').classList.toggle('selected', mode === 'prompt');
}

function renderActiveSelects() {
  var providerSelect = el('activeProviderSelect');
  var modelSelect = el('activeModelSelect');
  syncingActiveSelects = true;

  var providerHtml = '';
  if (state.providers.length === 0) {
    providerHtml = '<option value="">未配置</option>';
  } else {
    state.providers.forEach(function (p) {
      providerHtml += '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    });
  }
  providerSelect.innerHTML = providerHtml;
  providerSelect.disabled = state.providers.length === 0;

  var activeId = state.activeProviderId || '';
  if (activeId && state.providers.some(function (p) { return p.id === activeId; })) {
    providerSelect.value = activeId;
  } else if (state.providers.length > 0) {
    providerSelect.selectedIndex = 0;
  }

  var selectedProvider = state.providers.filter(function (p) {
    return p.id === providerSelect.value;
  })[0];
  var models = selectedProvider ? normalizeModels(selectedProvider.models) : [];
  var modelHtml = '';
  if (!selectedProvider || models.length === 0) {
    modelHtml = '<option value="">未配置</option>';
  } else {
    models.forEach(function (m) {
      modelHtml += '<option value="' + esc(m.id) + '">' + esc(m.id) + ' (' + formatContextSize(m.contextSize) + ')</option>';
    });
  }
  modelSelect.innerHTML = modelHtml;
  modelSelect.disabled = models.length === 0;

  if (models.length > 0) {
    var ids = models.map(function (m) { return m.id; });
    if (state.activeModel && ids.indexOf(state.activeModel) >= 0) {
      modelSelect.value = state.activeModel;
    } else {
      modelSelect.selectedIndex = 0;
    }
  }

  syncingActiveSelects = false;
}

function renderForm() {
  var isEdit = mode === 'edit';
  showMainView('form');
  el('formTitle').textContent = isEdit ? '编辑模型供应商' : '添加模型供应商';
  el('deleteBtn').classList.toggle('hidden', !isEdit);
  el('saveBtn').textContent = isEdit ? '保存修改' : '添加供应商';

  el('nameInput').value = form.name;
  el('baseUrlInput').value = form.baseUrl;
  el('apiFormatSelect').value = form.apiFormat;
  el('apiKeyInput').value = '';
  el('modelContextInput').value = String(state.defaultContextSize || DEFAULT_CONTEXT_SIZE);

  var saved = isEdit ? state.providers.filter(function (p) { return p.id === form.id; })[0] : null;
  el('apiKeyInput').placeholder = saved && saved.hasApiKey ? '已保存,留空表示不修改' : '输入 API Key';

  renderModels();
  renderSidebar();
  showMessage('');
}

function updatePromptStatus() {
  var customized = !!(state.systemPromptCustomized && state.systemPromptCustomized[promptLanguage]);
  var dirtyHint = promptDirty ? ' · 未保存' : '';
  el('promptStatusLabel').textContent = (customized ? '已自定义' : '使用内置默认') + dirtyHint;
}

function renderPromptView(forceText) {
  showMainView('prompt');
  el('promptLanguageSelect').value = promptLanguage;
  if (forceText || !promptDirty) {
    var text = (state.systemPrompts && state.systemPrompts[promptLanguage])
      || (state.defaultSystemPrompts && state.defaultSystemPrompts[promptLanguage])
      || '';
    el('systemPromptInput').value = text;
    promptDirty = false;
  }
  updatePromptStatus();
  renderSidebar();
}

function renderModels() {
  var wrap = el('modelChips');
  var html = '';
  form.models.forEach(function (m) {
    var isActive = mode === 'edit' && form.id === state.activeProviderId && m.id === state.activeModel;
    html += '<span class="chip' + (isActive ? ' active' : '') + '" data-model="' + esc(m.id) + '">'
      + esc(m.id)
      + '<span class="chip-meta">' + formatContextSize(m.contextSize) + '</span>'
      + '<button class="remove" data-action="remove" title="从列表移除">×</button>'
      + '</span>';
  });
  wrap.innerHTML = html;
  Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (btn) {
    btn.addEventListener('click', function () {
      var model = btn.parentElement.getAttribute('data-model');
      form.models = form.models.filter(function (m) { return m.id !== model; });
      renderModels();
    });
  });
}

function selectProvider(id) {
  var p = state.providers.filter(function (x) { return x.id === id; })[0];
  if (!p) { return; }
  mode = 'edit';
  form = {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiFormat: p.apiFormat,
    models: normalizeModels(p.models)
  };
  promptDirty = false;
  renderForm();
}

function openPromptView() {
  mode = 'prompt';
  form = null;
  promptLanguage = state.commitLanguage || 'zh-CN';
  promptDirty = false;
  showPromptMessage('');
  renderPromptView(true);
}

function readFormInputs() {
  form.name = el('nameInput').value.trim();
  form.baseUrl = el('baseUrlInput').value.trim();
  form.apiFormat = el('apiFormatSelect').value;
}

function validate() {
  if (!form.name) { return '请填写名称'; }
  if (!new RegExp('^https?://').test(form.baseUrl)) { return 'Base URL 必须以 http:// 或 https:// 开头'; }
  if (form.models.length === 0) { return '请至少添加一个模型'; }
  return null;
}

function parseContextInput(raw) {
  var cleaned = String(raw || '').replace(/[,_\\s]/g, '');
  if (!cleaned) { return DEFAULT_CONTEXT_SIZE; }
  var n = parseInt(cleaned, 10);
  if (isNaN(n) || n <= 0) { return null; }
  return n;
}

function bindEvents() {
  el('addProviderBtn').addEventListener('click', function () {
    mode = 'add';
    form = { id: null, name: '', baseUrl: '', apiFormat: 'openai-chat', models: [] };
    promptDirty = false;
    renderForm();
  });

  el('promptNavBtn').addEventListener('click', function () {
    openPromptView();
  });

  el('addModelBtn').addEventListener('click', function () {
    var value = el('modelInput').value.trim();
    if (!value) { showMessage('请输入模型 id', false); return; }
    if (findModelIndex(value) >= 0) { showMessage('模型已存在: ' + value, false); return; }
    var ctx = parseContextInput(el('modelContextInput').value);
    if (ctx === null) { showMessage('请输入有效的上下文大小(正整数 tokens)', false); return; }
    // 只加入列表,不切换当前模型
    form.models.push({ id: value, contextSize: ctx });
    el('modelInput').value = '';
    el('modelContextInput').value = String(state.defaultContextSize || DEFAULT_CONTEXT_SIZE);
    renderModels();
    showMessage('已加入模型列表,保存后生效。当前模型不会自动切换。', true);
  });

  el('activeProviderSelect').addEventListener('change', function () {
    if (syncingActiveSelects) { return; }
    var providerId = el('activeProviderSelect').value;
    if (!providerId) { return; }
    var provider = state.providers.filter(function (p) { return p.id === providerId; })[0];
    var models = provider ? normalizeModels(provider.models) : [];
    if (!provider || models.length === 0) {
      renderActiveSelects();
      return;
    }
    var ids = models.map(function (m) { return m.id; });
    var model = ids.indexOf(state.activeModel) >= 0 ? state.activeModel : models[0].id;
    vscode.postMessage({ type: 'setActive', providerId: providerId, model: model });
  });

  el('activeModelSelect').addEventListener('change', function () {
    if (syncingActiveSelects) { return; }
    var providerId = el('activeProviderSelect').value || state.activeProviderId;
    var model = el('activeModelSelect').value;
    if (!providerId || !model) { return; }
    vscode.postMessage({ type: 'setActive', providerId: providerId, model: model });
  });

  el('modelInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); el('addModelBtn').click(); }
  });
  el('modelContextInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); el('addModelBtn').click(); }
  });

  el('saveBtn').addEventListener('click', function () {
    readFormInputs();
    var error = validate();
    if (error) { showMessage(error, false); return; }
    var apiKey = el('apiKeyInput').value;
    vscode.postMessage({
      type: 'saveProvider',
      provider: {
        id: form.id,
        name: form.name,
        baseUrl: form.baseUrl,
        apiFormat: form.apiFormat,
        models: form.models
      },
      apiKey: apiKey ? apiKey : undefined
    });
  });

  el('deleteBtn').addEventListener('click', function () {
    if (!form || !form.id) { return; }
    var providerId = form.id;
    var isActive = providerId === state.activeProviderId;
    var tip = isActive
      ? '确定删除当前使用的供应商「' + form.name + '」？将同时删除已保存的 API Key，并自动切换到其他供应商。'
      : '确定删除供应商「' + form.name + '」？该操作会同时删除已保存的 API Key。';
    askConfirm(tip, function () {
      vscode.postMessage({ type: 'deleteProvider', id: providerId });
      mode = 'empty';
      form = null;
      showMainView('empty');
      renderSidebar();
    }, { danger: true, okText: '删除' });
  });

  el('testBtn').addEventListener('click', function () {
    readFormInputs();
    if (!form.baseUrl) { showMessage('请先填写 Base URL', false); return; }
    var model = form.models[0] ? form.models[0].id : null;
    if (!model) { showMessage('请先添加至少一个模型', false); return; }
    testing = true;
    el('testBtn').disabled = true;
    showMessage('正在测试连接…', true);
    vscode.postMessage({
      type: 'testConnection',
      provider: { id: form.id, name: form.name, baseUrl: form.baseUrl, apiFormat: form.apiFormat },
      model: model,
      apiKey: el('apiKeyInput').value || undefined
    });
  });

  el('promptLanguageSelect').addEventListener('change', function () {
    var next = el('promptLanguageSelect').value;
    function applyLanguage() {
      promptLanguage = next;
      promptDirty = false;
      showPromptMessage('');
      vscode.postMessage({ type: 'setLanguage', language: promptLanguage });
      renderPromptView(true);
    }
    if (!promptDirty) {
      applyLanguage();
      return;
    }
    el('promptLanguageSelect').value = promptLanguage;
    askConfirm('当前 System Prompt 有未保存修改，切换语言将丢弃这些修改。继续？', function () {
      el('promptLanguageSelect').value = next;
      applyLanguage();
    });
  });

  el('systemPromptInput').addEventListener('input', function () {
    promptDirty = true;
    updatePromptStatus();
  });

  el('savePromptBtn').addEventListener('click', function () {
    vscode.postMessage({
      type: 'saveSystemPrompt',
      language: promptLanguage,
      prompt: el('systemPromptInput').value
    });
  });

  el('resetPromptBtn').addEventListener('click', function () {
    askConfirm('确定恢复该语言的内置默认 System Prompt？', function () {
      vscode.postMessage({ type: 'resetSystemPrompt', language: promptLanguage });
    });
  });

  el('confirmOk').addEventListener('click', function () { resolveConfirm(true); });
  el('confirmCancel').addEventListener('click', function () { resolveConfirm(false); });
  el('confirmOverlay').addEventListener('click', function (e) {
    if (e.target === el('confirmOverlay')) { resolveConfirm(false); }
  });
  document.addEventListener('keydown', function (e) {
    if (el('confirmOverlay').classList.contains('hidden')) { return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveConfirm(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveConfirm(true);
    }
  });
}

window.addEventListener('message', function (event) {
  var msg = event.data;
  if (msg.type === 'state') {
    state = msg.state;
    if (mode === 'edit' && form) {
      var saved = state.providers.filter(function (p) { return p.id === form.id; })[0];
      if (!saved) {
        mode = 'empty'; form = null;
        showMainView('empty');
      } else {
        // 不覆盖本地未保存编辑;只刷新当前高亮
        renderModels();
      }
    } else if (mode === 'prompt') {
      promptDirty = false;
      renderPromptView(true);
    } else if (mode === 'empty') {
      showMainView('empty');
    }
    renderSidebar();
  } else if (msg.type === 'saveResult') {
    if (msg.ok) {
      showMessage('已保存 ✓', true);
      if (msg.providerId) {
        mode = 'edit';
        form.id = msg.providerId;
        renderForm();
      }
    } else {
      showMessage(msg.error || '保存失败', false);
    }
  } else if (msg.type === 'testResult') {
    testing = false;
    el('testBtn').disabled = false;
    showMessage(msg.message, msg.ok);
  } else if (msg.type === 'promptResult') {
    promptDirty = false;
    showPromptMessage(msg.message || '', msg.ok);
    updatePromptStatus();
  }
});

(function init() {
  var fmt = el('apiFormatSelect');
  API_FORMATS.forEach(function (f) {
    var opt = document.createElement('option');
    opt.value = f.value;
    opt.textContent = f.label;
    fmt.appendChild(opt);
  });
  el('modelContextInput').value = String(DEFAULT_CONTEXT_SIZE);
  bindEvents();
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
