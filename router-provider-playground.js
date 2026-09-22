(function () {
  const QUICKSTART_PATH = "/development/comfy-router/quickstart";

  function languageLabel(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function modelLabelKey(label) {
    return String(label || "").replace(/\s+/g, " ").trim().toLowerCase();
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

  async function modelAlternateProviders(path) {
    const response = await fetch(path, { headers: { Accept: "text/html" } });
    if (!response.ok) return [];
    const html = await response.text();
    return Array.from(new Set(Array.from(html.matchAll(/model_provider=([a-z0-9_-]+)/g)).map(function (match) {
      return match[1];
    })));
  }

  async function quickstartProviderExamples() {
    const response = await fetch("/development/comfy-router/providers", { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error("provider coverage unavailable");
    const documentRoot = new DOMParser().parseFromString(await response.text(), "text/html");
    const playground = documentRoot.querySelector('[data-router-playground="true"]');
    if (!playground) return new Map();
    const providersByModel = new Map();
    playground.querySelectorAll('[data-router-option]').forEach(function (option) {
      const label = option.textContent.replace(/\s+/g, " ").trim();
      const separator = label.lastIndexOf(" via ");
      if (separator < 0) return;
      const modelLabel = label.slice(0, separator);
      const providerLabel = label.slice(separator + 5);
      const providerId = providerLabel.replace(/\s+/g, "-").toLowerCase();
      const modelExample = Array.from(playground.querySelectorAll("[data-router-model-example]")).find(function (candidate) {
        return candidate.dataset.routerModelExample === option.dataset.routerOption;
      });
      const tabList = modelExample && languageTabList(modelExample);
      const examples = {};
      if (tabList) tabList.querySelectorAll('[role="tab"]').forEach(function (tab) {
        const panel = documentRoot.getElementById(tab.getAttribute("aria-controls"));
        const code = panel?.querySelector("pre code");
        if (code) examples[languageLabel(tab)] = code.innerHTML;
      });
      const providers = providersByModel.get(modelLabelKey(modelLabel)) || [];
      providers.push({ id: providerId, label: providerLabel, examples });
      providersByModel.set(modelLabelKey(modelLabel), providers);
    });
    return providersByModel;
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
      <span class="router-provider-playground-label router-quickstart-provider-label">Provider</span>
      <div class="router-provider-picker">
        <button type="button" class="router-provider-model-button" data-router-quickstart-provider-button="true" aria-haspopup="listbox" aria-expanded="false">Comfy (default)</button>
        <div class="router-provider-model-menu" data-router-quickstart-provider-menu="true" role="listbox" hidden></div>
      </div>
      <p class="router-quickstart-model-status" data-router-quickstart-status="true" aria-live="polite">Examples are loaded from each model’s Code page.</p>`;
    codeGroup.parentElement.insertBefore(picker, codeGroup);

    const button = picker.querySelector('[data-router-quickstart-model-button="true"]');
    const menu = picker.querySelector('[data-router-quickstart-model-menu="true"]');
    const providerButton = picker.querySelector('[data-router-quickstart-provider-button="true"]');
    const providerMenu = picker.querySelector('[data-router-quickstart-provider-menu="true"]');
    const status = picker.querySelector('[data-router-quickstart-status="true"]');
    const storageKey = "router-quickstart-model";
    let selectedId = "bfl/flux-2-pro";
    let selectedProvider = "";
    let selectedModel = null;
    let providersByModel = new Map();
    const alternateProviderIdsCache = new Map();
    const examplesCache = new Map();
    const providerExamplesPromise = quickstartProviderExamples().then(function (providers) {
      providersByModel = providers;
      return providers;
    }).catch(function () {
      return providersByModel;
    });
    providerExamplesPromise.then(function () {
      if (selectedModel) renderProviderOptions(selectedModel);
    });

    try {
      selectedId = sessionStorage.getItem(storageKey) || selectedId;
    } catch (_) {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    function closeMenus() {
      button.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      providerButton.setAttribute("aria-expanded", "false");
      providerMenu.hidden = true;
    }

    function providerOptions(model) {
      const known = providersByModel.get(modelLabelKey(model.label)) || [];
      const knownIds = new Set(known.map(function (provider) { return provider.id; }));
      const discovered = (alternateProviderIdsCache.get(model.id) || []).filter(function (providerId) {
        return !knownIds.has(providerId);
      }).map(function (providerId) {
        return { id: providerId, label: providerId };
      });
      return [{ id: "", label: "Comfy (default)" }].concat(known, discovered);
    }

    function renderProviderOptions(model) {
      const options = providerOptions(model);
      providerMenu.replaceChildren();
      options.forEach(function (provider) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "option");
        option.dataset.routerQuickstartProvider = provider.id;
        option.setAttribute("aria-selected", String(provider.id === selectedProvider));
        option.textContent = provider.label;
        option.addEventListener("click", function () { selectProvider(provider); });
        providerMenu.appendChild(option);
      });
      const selected = options.find(function (provider) { return provider.id === selectedProvider; }) || options[0];
      selectedProvider = selected.id;
      providerButton.textContent = selected.label;
    }

    async function loadSelectedExamples(model) {
      status.textContent = "Loading the selected model’s examples…";
      try {
        let examples;
        if (selectedProvider) {
          await providerExamplesPromise;
          examples = providersByModel.get(modelLabelKey(model.label))?.find(function (provider) {
            return provider.id === selectedProvider;
          })?.examples;
        } else {
          examples = examplesCache.get(model.id);
          if (!examples) {
            examples = await modelCodeExamples(model.path);
            if (examples) examplesCache.set(model.id, examples);
          }
        }
        if (!examples) {
          status.textContent = selectedProvider
            ? "This alternate provider does not publish a runnable example for this model."
            : "This model does not publish a runnable example. Open its Code page for the schema.";
          return;
        }
        applyQuickstartExamples(tabList, examples);
        status.textContent = selectedProvider
          ? "Examples loaded for the selected alternate provider."
          : "Examples loaded from the selected model’s Code page.";
      } catch (_) {
        status.textContent = "Could not load this example. Open the model’s Code page to continue.";
      }
    }

    async function selectModel(model) {
      selectedModel = model;
      selectedId = model.id;
      button.textContent = `${model.label} · ${model.id}`;
      selectedProvider = "";
      try {
        alternateProviderIdsCache.set(model.id, await modelAlternateProviders(model.path));
      } catch (_) {
        alternateProviderIdsCache.set(model.id, []);
      }
      renderProviderOptions(model);
      closeMenus();
      menu.querySelectorAll("[data-router-quickstart-model]").forEach(function (option) {
        option.setAttribute("aria-selected", String(option.dataset.routerQuickstartModel === selectedId));
      });
      try {
        sessionStorage.setItem(storageKey, selectedId);
      } catch (_) {
        // The picker still works when storage is unavailable.
      }
      await loadSelectedExamples(model);
    }

    async function selectProvider(provider) {
      if (!selectedModel) return;
      selectedProvider = provider.id;
      providerButton.textContent = provider.label;
      providerMenu.querySelectorAll("[data-router-quickstart-provider]").forEach(function (option) {
        option.setAttribute("aria-selected", String(option.dataset.routerQuickstartProvider === selectedProvider));
      });
      closeMenus();
      await loadSelectedExamples(selectedModel);
    }

    button.addEventListener("click", function () {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      menu.hidden = open;
    });
    providerButton.addEventListener("click", function () {
      const open = providerButton.getAttribute("aria-expanded") === "true";
      providerButton.setAttribute("aria-expanded", String(!open));
      providerMenu.hidden = open;
    });
    document.addEventListener("click", function (event) {
      if (!picker.contains(event.target)) closeMenus();
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
