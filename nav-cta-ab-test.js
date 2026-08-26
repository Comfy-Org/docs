// PostHog A/B test for the docs navbar CTA copy.
//
// The navbar CTA ("Comfy Cloud" -> https://comfy.org/cloud?utm_source=docs)
// is rendered by the docs platform from docs.json, so variant assignment
// happens here in a small JS hook that reads the PostHog flag. Mintlify
// inlines every root-level .js file on all pages, so this runs site-wide.
//
// Flag: docs_nav_cta_copy_v1 (string flag)
//   - "try_cloud_free" -> label becomes "Try Cloud Free" (homepage-style copy)
//   - "control"        -> keep "Comfy Cloud" (the docs.json default)
//   - unset/undefined  -> "Comfy Cloud" (control)
//
// The href is intentionally unchanged in both variants. Clicks to
// comfy.org/cloud already convert well (27% of clickers sign up); the test
// isolates the copy, not the destination.
//
// Exposure: calling posthog.getFeatureFlag() automatically captures the
// $feature_flag_called event (deduplicated per session), carrying the flag
// key and the assigned response. Clicks are captured explicitly as
// "docs_nav_cta_clicked" with the assigned variant so the test can be
// analyzed against docs-attributed signups in PostHog.

(function () {
  "use strict";

  var FLAG_KEY = "docs_nav_cta_copy_v1";
  var CTA_HREF = "https://comfy.org/cloud?utm_source=docs";
  var VARIANTS = {
    control: { label: "Comfy Cloud" },
    try_cloud_free: { label: "Try Cloud Free" }
  };
  // Labels we are allowed to swap, so re-renders and flag flips stay idempotent.
  var KNOWN_LABELS = ["Comfy Cloud", "Try Cloud Free"];
  var assignedVariant = "control";

  function variantLabel(variant) {
    return (VARIANTS[variant] || VARIANTS.control).label;
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
    var variant = "control";
    try {
      if (window.posthog) {
        var raw = window.posthog.getFeatureFlag(FLAG_KEY);
        if (raw === "control" || raw === "try_cloud_free") {
          variant = raw;
        }
      }
    } catch (e) {
      // PostHog not ready or flag lookup failed: keep the control copy.
    }
    assignedVariant = variant;
    applyLabel(variantLabel(variant));
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

  function init() {
    if (window.posthog && window.posthog.onFeatureFlags) {
      window.posthog.onFeatureFlags(function () {
        applyVariant();
        watchNav();
      });
      return;
    }
    // PostHog loads async via the docs platform integration. Poll briefly so
    // the hook still runs if it arrives late, then fall back to control.
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.posthog && window.posthog.onFeatureFlags) {
        clearInterval(timer);
        window.posthog.onFeatureFlags(function () {
          applyVariant();
          watchNav();
        });
      } else if (tries >= 100) {
        clearInterval(timer);
        applyVariant();
        watchNav();
      }
    }, 100);
  }

  // Record CTA clicks with the assigned variant for funnel analysis.
  document.addEventListener(
    "click",
    function (event) {
      if (!window.posthog) return;
      var target =
        event.target instanceof Element
          ? event.target.closest('a[href="' + CTA_HREF + '"]')
          : null;
      if (!target) return;
      window.posthog.capture("docs_nav_cta_clicked", {
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
