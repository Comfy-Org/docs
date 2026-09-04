document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-sample-open]");
  const backButton = event.target.closest("[data-sample-back]");

  if (openButton) {
    const card = openButton.closest("[data-sample-card]");
    const path = openButton.dataset.sampleOpen;
    const front = card.querySelector("[data-sample-front]");
    const selectedPath = card.querySelector(`[data-sample-path="${path}"]`);
    event.preventDefault();
    card.dataset.activePath = path;
    card.dataset.flipped = "true";
    front.inert = true;
    front.setAttribute("aria-hidden", "true");
    card.querySelectorAll("[data-sample-path]").forEach((panel) => {
      panel.inert = panel !== selectedPath;
      panel.setAttribute("aria-hidden", panel === selectedPath ? "false" : "true");
    });
  }

  if (backButton) {
    const card = backButton.closest("[data-sample-card]");
    const front = card.querySelector("[data-sample-front]");
    event.preventDefault();
    card.removeAttribute("data-flipped");
    card.removeAttribute("data-active-path");
    front.inert = false;
    front.setAttribute("aria-hidden", "false");
    card.querySelectorAll("[data-sample-path]").forEach((panel) => {
      panel.inert = true;
      panel.setAttribute("aria-hidden", "true");
    });
  }
});
