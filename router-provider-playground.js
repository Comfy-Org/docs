(function () {
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

  initializePlaygrounds();
  new MutationObserver(initializePlaygrounds).observe(document.body, { childList: true, subtree: true });
})();

