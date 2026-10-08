// PostHog A/B test for the docs navbar CTA copy.
//
// Self-contained variant assignment (no PostHog feature flag): each visitor
// is randomly assigned control ("Comfy Cloud") or test ("Try Cloud for free")
// with a 50/50 split. The assignment is kept stable per browser via
// localStorage, so the label does not flip between page loads, and every CTA
// click is captured as a PostHog event for per-variant analysis.
//
// Analysis events:
//   - docs_nav_cta_exposure  {variant, label}  captured once per page load
//   - docs_nav_cta_clicked   {variant, label, href}
//
// The href is intentionally identical in both variants. Clicks to
// comfy.org/cloud already convert well (27% of clickers sign up); the test
// isolates the copy, not the destination.
//
// This deliberately does NOT use a PostHog feature flag / experiment.
// docs.comfy.org evaluates flags through Mintlify's proxy (an unverified
// path), and the test is small and self-contained. Trade-off: no PostHog
// experiment readout (significance testing, guardrails) or dashboard kill
// switch; analysis is manual, filtering the events above by variant. See the
// #website-and-docs Slack thread for the discussion.

(function () {
  "use strict";

  var STORAGE_KEY = "docs_nav_cta_variant";
  var CTA_HREF = "https://comfy.org/cloud?utm_source=docs";
  var VARIANTS = {
    control: { label: "Comfy Cloud" },
    test: { label: "Try Cloud for free" }
  };
  // Labels we are allowed to swap, so re-renders and storage flips stay idempotent.
  var KNOWN_LABELS = ["Comfy Cloud", "Try Cloud for free"];
  var assignedVariant = "control";

  function variantLabel(variant) {
    return (VARIANTS[variant] || VARIANTS.control).label;
  }

  // Assign the variant once per browser (sticky), falling back to a fresh
  // random draw when storage is unavailable.
  function assignVariant() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // Storage blocked (private mode): fall through to a random draw.
    }
    if (stored === "control" || stored === "test") return stored;
    var variant = Math.random() > 0.5 ? "test" : "control";
    try {
      window.localStorage.setItem(STORAGE_KEY, variant);
    } catch (e) {
      // Best-effort; the draw still applies for this page load.
    }
    return variant;
  }

  // Swap the label on every CTA link (desktop button, mobile nav link, and
  // any future duplicate). Returns true when at least one label was updated.
  function applyLabel(label) {
    var links = document.querySelectorAll('a[href="' + CTA_HREF + '"]');
    var changed = false;
    for (var i = 0; i < links.length; i++) {
      var spans = links[i].querySelectorAll("span");
      for (var j = 0; j < spans.length; j++) {
        var text = (spans[j].textContent || "").trim();
        if (KNOWN_LABELS.indexOf(text) !== -1) {
          spans[j].textContent = label;
          changed = true;
          break;
        }
      }
    }
    return changed;
  }

  function applyVariant() {
    assignedVariant = assignVariant();
    applyLabel(variantLabel(assignedVariant));
  }

  // The navbar can re-render on navigation (Mintlify is a Next.js SPA).
  // Re-apply the variant whenever the CTA link appears or changes, debounced.
  var observer = null;
  var scheduled = false;
  function watchNav() {
    if (observer || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        applyVariant();
      }, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // PostHog loads async via the docs platform integration; capture the
  // exposure once it is available (poll briefly, then give up silently).
  function captureExposure() {
    var ph = window.posthog;
    if (!ph || !ph.capture) return;
    ph.capture("docs_nav_cta_exposure", {
      variant: assignedVariant,
      label: variantLabel(assignedVariant)
    });
  }

  function init() {
    applyVariant();
    watchNav();
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.posthog && window.posthog.capture) {
        clearInterval(timer);
        captureExposure();
      } else if (tries >= 100) {
        clearInterval(timer);
      }
    }, 100);
  }

  // Record CTA clicks with the assigned variant for funnel analysis.
  document.addEventListener(
    "click",
    function (event) {
      var ph = window.posthog;
      if (!ph || !ph.capture) return;
      var target =
        event.target instanceof Element
          ? event.target.closest('a[href="' + CTA_HREF + '"]')
          : null;
      if (!target) return;
      ph.capture("docs_nav_cta_clicked", {
        variant: assignedVariant,
        label: variantLabel(assignedVariant),
        href: target.href
      });
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
