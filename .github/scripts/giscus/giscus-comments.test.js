const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, '..', '..', '..', 'giscus-comments.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function loadPolicy() {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
  };
  // The script assigns window.retryGiscus and window.giscusDebug at load.
  // No document, so init() does not run.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(scriptSource, sandbox, { filename: 'giscus-comments.js' });
  assert.ok(sandbox.__COMFY_GISCUS_POLICY__, 'policy helpers are exported when document is absent');
  return sandbox.__COMFY_GISCUS_POLICY__;
}

const policy = loadPolicy();

test('empty discussion is not a load failure', () => {
  // What giscus actually posts: { giscus: { error: "Discussion not found" } }.
  // The old listener read error.type. A string has no type, so this fell
  // through to the "could not be loaded" notice.
  assert.equal(policy.classifyGiscusError('Discussion not found'), 'ignore');
  assert.equal(policy.classifyGiscusError('discussion not found'), 'ignore');
  assert.equal(
    policy.classifyGiscusError({ message: 'Discussion not found' }),
    'ignore'
  );
  assert.equal('Discussion not found'.type, undefined);
});

test('rate limits are recognized from giscus text and from a type field', () => {
  assert.equal(policy.classifyGiscusError('API rate limit exceeded'), 'rate_limit');
  assert.equal(policy.classifyGiscusError('You have exceeded a secondary rate limit'), 'rate_limit');
  assert.equal(policy.classifyGiscusError({ type: 'RATE_LIMITED' }), 'rate_limit');
  assert.equal(policy.classifyGiscusError({ type: 'rate_limit' }), 'rate_limit');
  assert.equal(policy.classifyGiscusError({ type: 'rate-limit', message: 'slow down' }), 'rate_limit');
});

test('other giscus errors still count as load failures', () => {
  assert.equal(policy.classifyGiscusError('Bad credentials'), 'network');
  assert.equal(policy.classifyGiscusError('Something went wrong'), 'network');
  assert.equal(policy.classifyGiscusError({ type: 'FORBIDDEN', message: 'nope' }), 'network');
});

test('same-page URL updates do not reload, path and locale changes do', () => {
  const page = '/tutorials/partner-nodes/concurrency-limits';
  const mounted = true;
  const missing = false;

  assert.equal(policy.docsPagePath(page + '/'), page);
  assert.equal(policy.docsPagePath(page + '#heading'), page);
  assert.equal(policy.docsPagePath(page + '?ask=1'), page);
  assert.equal(policy.isSameDocsPage(page, page + '/#limits'), true);
  assert.equal(policy.isSameDocsPage(page, '/zh' + page), false);

  // Widget already on this page: hash, query, trailing slash.
  assert.equal(policy.shouldReloadGiscus(page, page + '#heading', mounted), false);
  assert.equal(policy.shouldReloadGiscus(page, page + '?ask=1', mounted), false);
  assert.equal(policy.shouldReloadGiscus(page, page + '/', mounted), false);

  // First load, and a real navigation.
  assert.equal(policy.shouldReloadGiscus('', page, missing), true);
  assert.equal(policy.shouldReloadGiscus(page, '/tutorials/partner-nodes/faq', mounted), true);
  assert.equal(policy.shouldReloadGiscus(page, '/zh' + page, mounted), true);
  assert.equal(policy.shouldReloadGiscus('/ja' + page, '/ko' + page, mounted), true);

  // Mintlify replaced the content node and the widget went with it.
  assert.equal(policy.shouldReloadGiscus(page, page, missing), true);
});

test('homepage does not keep retrying once the widget is gone', () => {
  assert.equal(policy.shouldReloadGiscus('/', '/', false), false);
  assert.equal(policy.shouldReloadGiscus('/zh', '/zh', false), false);
  assert.equal(policy.shouldReloadGiscus('/tutorials/partner-nodes/faq', '/', true), true);
  assert.equal(policy.shouldReloadGiscus('/', '/', true), true);
});

test('listener classifies the giscus payload instead of reading error.type', () => {
  assert.equal(scriptSource.includes('message.giscus.error.type'), false);
  assert.equal(scriptSource.includes('classifyGiscusError('), true);
  assert.equal(scriptSource.includes('shouldReloadGiscus('), true);
  // Same-page updates return before the pending navigation timer is cleared.
  const scheduleStart = scriptSource.indexOf('function scheduleGiscusLoad');
  const clearTimer = scriptSource.indexOf('clearTimeout(routeLoadTimer)', scheduleStart);
  const samePageGuard = scriptSource.indexOf('shouldReloadGiscus(currentPath, scheduledPath', scheduleStart);
  assert.ok(scheduleStart > 0 && samePageGuard > scheduleStart && samePageGuard < clearTimer);
});

// Browser-shaped host for the IIFE. Enough of the DOM for one insert, a
// same-page history update, and a cross-page navigation. Timers are virtual
// so the 3s initial delay and the content-stability wait do not block.
function loadWidget(pathname) {
  const location = {
    pathname,
    search: '',
    hash: '',
    href: 'https://docs.comfy.org' + pathname,
  };

  function applyUrl(url) {
    if (url == null || url === '') return;
    const parsed = new URL(String(url), 'https://docs.comfy.org');
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
    location.href = parsed.href;
  }

  const history = {
    pushState(_state, _title, url) { applyUrl(url); },
    replaceState(_state, _title, url) { applyUrl(url); },
  };

  const observers = [];
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  }
  class IntersectionObserver {
    observe() {}
    disconnect() {}
  }

  function notify() {
    for (const observer of observers) observer.callback([]);
  }

  function classNames(el) {
    return String(el.className || '').split(/\s+/).filter(Boolean);
  }

  function matches(el, selector) {
    const raw = String(selector || '').trim();
    if (!raw) return false;
    if (raw.includes(',')) return raw.split(',').some((part) => matches(el, part));

    const classContains = raw.match(/\[class\*="([^"]+)"\]/);
    if (classContains) return String(el.className || '').includes(classContains[1]);
    if (raw.includes(':') || raw.includes('>') || raw.includes('[')) return false;

    const parts = raw.match(/([.#]?[^.#]+)/g) || [];
    return parts.every((part) => {
      if (part.startsWith('.')) return classNames(el).includes(part.slice(1));
      if (part.startsWith('#')) return el.id === part.slice(1);
      return el.tagName === part.toLowerCase();
    });
  }

  function walk(el, acc) {
    acc.push(el);
    for (const child of el.children) walk(child, acc);
    return acc;
  }

  function selectAll(root, selector) {
    return walk(root, []).filter((el) => matches(el, selector));
  }

  class FakeEl {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.parent = null;
      this.id = '';
      this.className = '';
      this._text = '';
      this.innerHTML = '';
      this.isConnected = false;
      this.scrollHeight = 800;
      this.clientHeight = 600;
      this.attributes = {};
      this.listeners = {};
    }
    get classList() {
      const el = this;
      return {
        contains(name) { return classNames(el).includes(name); },
        add() {},
        remove() {},
      };
    }
    get childElementCount() { return this.children.length; }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value); }
    get parentElement() { return this.parent; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      child.isConnected = this.isConnected;
      for (const node of walk(child, []).slice(1)) node.isConnected = child.isConnected;
      notify();
      return child;
    }
    insertBefore(child, before) {
      const index = this.children.indexOf(before);
      child.parent = this;
      if (index === -1) this.children.push(child);
      else this.children.splice(index, 0, child);
      child.isConnected = this.isConnected;
      notify();
      return child;
    }
    remove() {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((child) => child !== this);
      }
      this.isConnected = false;
      this.parent = null;
      notify();
    }
    closest(selector) {
      let node = this;
      while (node) {
        if (matches(node, selector)) return node;
        node = node.parent;
      }
      return null;
    }
    querySelector(selector) { return selectAll(this, selector)[0] || null; }
    querySelectorAll(selector) { return selectAll(this, selector); }
  }

  const documentElement = new FakeEl('html');
  documentElement.isConnected = true;
  const head = new FakeEl('head');
  const body = new FakeEl('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  const content = new FakeEl('div');
  content.className = 'mdx-content prose';
  content.textContent = 'Partner node concurrency limits. '.repeat(8);
  body.appendChild(content);

  const document = {
    readyState: 'complete',
    documentElement,
    head,
    body,
    createElement(tag) { return new FakeEl(tag); },
    querySelector(selector) { return selectAll(documentElement, selector)[0] || null; },
    querySelectorAll(selector) { return selectAll(documentElement, selector); },
    addEventListener() {},
  };

  let now = 0;
  const queue = [];
  function setTimeout(fn, ms) {
    const item = { fn, at: now + (ms || 0), cleared: false };
    queue.push(item);
    return item;
  }
  function clearTimeout(item) {
    if (item) item.cleared = true;
  }
  async function flush(ms) {
    const target = now + ms;
    for (let guard = 0; guard < 100000; guard++) {
      for (let i = 0; i < 40; i++) await Promise.resolve();
      let next = null;
      for (const item of queue) {
        if (item.cleared || item.at > target) continue;
        if (!next || item.at < next.at) next = item;
      }
      if (!next) {
        now = target;
        return;
      }
      now = next.at;
      next.cleared = true;
      next.fn();
    }
    throw new Error('timer flush did not settle');
  }

  const listeners = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document,
    location,
    history,
    MutationObserver,
    IntersectionObserver,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    Date,
    Promise,
    URL,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(scriptSource, sandbox, { filename: 'giscus-comments.js' });

  return {
    document,
    location,
    history,
    content,
    listeners,
    flush,
    containers() { return document.querySelectorAll('.giscus-container'); },
  };
}

test('same-page history updates keep the mounted widget', async () => {
  const page = '/tutorials/partner-nodes/concurrency-limits';
  const host = loadWidget(page);
  await host.flush(12000);

  const containers = host.containers();
  assert.equal(containers.length, 1, 'initial load inserts one comments block');
  const widget = containers[0];
  assert.equal(widget.isConnected, true);
  const placeholder = widget.querySelector('.giscus-placeholder');
  assert.ok(placeholder);
  assert.match(placeholder.innerHTML, /Click or scroll here to load comments/);

  host.history.replaceState({}, '', page + '#rate-limits');
  await host.flush(12000);

  const afterHash = host.containers();
  assert.equal(afterHash.length, 1);
  assert.equal(afterHash[0], widget, 'hash update must not rebuild the widget');
  assert.equal(widget.isConnected, true);

  host.history.replaceState({}, '', page + '/');
  await host.flush(12000);
  assert.equal(host.containers()[0], widget, 'trailing slash must not rebuild the widget');

  host.history.replaceState({}, '', '/tutorials/partner-nodes/faq');
  await host.flush(12000);
  const moved = host.containers();
  assert.equal(moved.length, 1);
  assert.notEqual(moved[0], widget, 'a different page still loads its own widget');
  assert.equal(widget.isConnected, false);
});

test('discussion not found does not render the load-failure notice', async () => {
  const page = '/tutorials/partner-nodes/concurrency-limits';
  const host = loadWidget(page);
  await host.flush(12000);
  const widget = host.containers()[0];
  const iframe = host.document.createElement('iframe');
  iframe.className = 'giscus-frame';
  iframe.contentWindow = {};
  widget.appendChild(iframe);

  const onMessage = host.listeners.message[0];
  assert.ok(onMessage);
  onMessage({
    origin: 'https://giscus.app',
    source: iframe.contentWindow,
    data: { giscus: { error: 'Discussion not found' } },
  });

  assert.equal(widget.querySelector('.giscus-notice'), null);
  assert.equal(host.containers().length, 1);
  assert.equal(host.containers()[0], widget);
});

test('removing the content node on the same path mounts the widget again', async () => {
  const page = '/tutorials/partner-nodes/concurrency-limits';
  const host = loadWidget(page);
  await host.flush(12000);
  const first = host.containers()[0];
  assert.ok(first);

  host.content.remove();
  const replacement = host.document.createElement('div');
  replacement.className = 'mdx-content prose';
  replacement.textContent = 'Partner node concurrency limits. '.repeat(8);
  host.document.body.appendChild(replacement);
  await host.flush(12000);

  const next = host.containers();
  assert.equal(next.length, 1);
  assert.notEqual(next[0], first);
  assert.equal(next[0].parent, replacement);
});
