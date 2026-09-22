(function () {
  const QUICKSTART_PATH = "/development/comfy-router/quickstart";

  function languageLabel(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function languageTabList(root) {
    return Array.from(root.querySelectorAll('[role="tablist"]')).find(function (tabList) {
      const labels = Array.from(tabList.querySelectorAll('[role="tab"]')).map(languageLabel);
      return ["python", "typescript", "swift", "curl"].every(function (language) {
        return labels.includes(language);
      });
    });
  }

  async function quickstartModels() {
    const response = await fetch("/development/comfy-router/models", { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error("model catalog unavailable");
    const documentRoot = new DOMParser().parseFromString(await response.text(), "text/html");
    const seen = new Set();
    return Array.from(documentRoot.querySelectorAll("a")).flatMap(function (link) {
      const href = link.getAttribute("href") || "";
      if (!/^\/development\/comfy-router\/models\/[^?#]+\/code\/?$/.test(href)) return [];
      const id = link.closest("li")?.querySelector("code")?.textContent.trim();
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{ id, path: href, label: link.textContent.replace(/\s+/g, " ").trim() }];
    });
  }

  async function modelCodeExamples(path) {
    const response = await fetch(path, { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error("model page unavailable");
    const documentRoot = new DOMParser().parseFromString(await response.text(), "text/html");
    const tabList = languageTabList(documentRoot);
    if (!tabList) return null;
    const examples = {};
    tabList.querySelectorAll('[role="tab"]').forEach(function (tab) {
      const panel = documentRoot.getElementById(tab.getAttribute("aria-controls"));
      const code = panel?.querySelector("pre code");
      if (code) examples[languageLabel(tab)] = code.innerHTML;
    });
    return examples;
  }

  function applyQuickstartExamples(tabList, examples) {
    tabList.querySelectorAll('[role="tab"]').forEach(function (tab) {
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      const code = panel?.querySelector("pre code");
      const highlighted = examples[languageLabel(tab)];
      if (code && highlighted !== undefined) code.innerHTML = highlighted;
    });
  }

  function initializeQuickstart() {
    if (window.location.pathname !== QUICKSTART_PATH || document.querySelector('[data-router-quickstart-picker="true"]')) return;
    const tabList = languageTabList(document);
    if (!tabList) return;
    let codeGroup = tabList;
    while (codeGroup.parentElement && !codeGroup.querySelector('[role="tabpanel"]')) codeGroup = codeGroup.parentElement;
    if (!codeGroup.parentElement) return;

    const picker = document.createElement("div");
    picker.className = "router-quickstart-model-picker";
    picker.dataset.routerQuickstartPicker = "true";
    picker.innerHTML = `
      <span class="router-provider-playground-label">Model</span>
      <div class="router-provider-picker">
        <button type="button" class="router-provider-model-button" data-router-quickstart-model-button="true" aria-haspopup="listbox" aria-expanded="false">Loading models…</button>
        <div class="router-provider-model-menu" data-router-quickstart-model-menu="true" role="listbox" hidden></div>
      </div>
      <p class="router-quickstart-model-status" data-router-quickstart-status="true" aria-live="polite">Examples are loaded from each model’s Code page.</p>`;
    codeGroup.parentElement.insertBefore(picker, codeGroup);

    const button = picker.querySelector('[data-router-quickstart-model-button="true"]');
    const menu = picker.querySelector('[data-router-quickstart-model-menu="true"]');
    const status = picker.querySelector('[data-router-quickstart-status="true"]');
    const storageKey = "router-quickstart-model";
    let selectedId = "bfl/flux-2-pro";
    const examplesCache = new Map();

    try {
      selectedId = sessionStorage.getItem(storageKey) || selectedId;
    } catch (_) {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    function closeMenu() {
      button.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    }

    async function selectModel(model) {
      selectedId = model.id;
      button.textContent = `${model.label} · ${model.id}`;
      closeMenu();
      menu.querySelectorAll("[data-router-quickstart-model]").forEach(function (option) {
        option.setAttribute("aria-selected", String(option.dataset.routerQuickstartModel === selectedId));
      });
      try {
        sessionStorage.setItem(storageKey, selectedId);
      } catch (_) {
        // The picker still works when storage is unavailable.
      }
      status.textContent = "Loading the selected model’s examples…";
      try {
        let examples = examplesCache.get(model.id);
        if (!examples) {
          examples = await modelCodeExamples(model.path);
          if (examples) examplesCache.set(model.id, examples);
        }
        if (!examples) {
          status.textContent = "This model does not publish a runnable example. Open its Code page for the schema.";
          return;
        }
        applyQuickstartExamples(tabList, examples);
        status.textContent = "Examples loaded from the selected model’s Code page.";
      } catch (_) {
        status.textContent = "Could not load this model’s example. Open its Code page to continue.";
      }
    }

    button.addEventListener("click", function () {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      menu.hidden = open;
    });
    document.addEventListener("click", function (event) {
      if (!picker.contains(event.target)) closeMenu();
    });

    quickstartModels().then(function (loadedModels) {
      loadedModels.forEach(function (model) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "option");
        option.dataset.routerQuickstartModel = model.id;
        option.setAttribute("aria-selected", String(model.id === selectedId));
        option.textContent = `${model.label} · ${model.id}`;
        option.addEventListener("click", function () { selectModel(model); });
        menu.appendChild(option);
      });
      const selected = loadedModels.find(function (model) { return model.id === selectedId; }) || loadedModels[0];
      if (selected) selectModel(selected);
    }).catch(function () {
      status.textContent = "Could not load the model catalog. See the model catalog page for available examples.";
      button.textContent = "Model catalog unavailable";
    });
  }

  function initializePlaygrounds() {
    document.querySelectorAll('[data-router-playground="true"]').forEach(function (root) {
      if (root.dataset.routerReady === "true") return;
      const dataElement = root.querySelector('[data-router-provider-data="true"]');
      const modelButton = root.querySelector('[data-router-model-button="true"]');
      const modelMenu = root.querySelector('[data-router-model-menu="true"]');
      const modelOptions = root.querySelectorAll('[data-router-option]');
      const modelExamples = root.querySelectorAll('[data-router-model-example]');
      if (!dataElement || !modelButton || !modelMenu || modelExamples.length === 0) return;

      const encoded = dataElement.textContent || "";
      const bytes = Uint8Array.from(atob(encoded), function (character) { return character.charCodeAt(0); });
      const examples = JSON.parse(new TextDecoder().decode(bytes));
      const storageKey = "router-provider-model:" + window.location.pathname;
      let selectedId = examples[0] && examples[0].id;
      try {
        selectedId = sessionStorage.getItem(storageKey) || selectedId;
      } catch (_) {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }

      function render() {
        const example = examples.find(function (item) { return item.id === selectedId; }) || examples[0];
        if (!example) return;
        modelButton.textContent = example.label;
        modelExamples.forEach(function (modelExample) {
          modelExample.hidden = modelExample.dataset.routerModelExample !== example.id;
        });
        modelOptions.forEach(function (option) {
          option.setAttribute("aria-selected", String(option.dataset.routerOption === example.id));
        });
      }

      modelButton.addEventListener("click", function () {
        const open = modelButton.getAttribute("aria-expanded") === "true";
        modelButton.setAttribute("aria-expanded", String(!open));
        modelMenu.hidden = open;
      });
      modelOptions.forEach(function (option) {
        option.addEventListener("click", function () {
          selectedId = option.dataset.routerOption;
          try {
            sessionStorage.setItem(storageKey, selectedId);
          } catch (_) {
            // The picker still works when storage is unavailable.
          }
          modelButton.setAttribute("aria-expanded", "false");
          modelMenu.hidden = true;
          render();
        });
      });
      document.addEventListener("click", function (event) {
        if (!root.contains(event.target)) {
          modelButton.setAttribute("aria-expanded", "false");
          modelMenu.hidden = true;
        }
      });
      root.dataset.routerReady = "true";
      render();
    });
  }

  function initialize() {
    initializePlaygrounds();
    initializeQuickstart();
  }

  initialize();
  new MutationObserver(initialize).observe(document.body, { childList: true, subtree: true });
})();
