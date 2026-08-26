// PostHog A/B test for the docs navbar CTA copy.
//
// The navbar CTA ("Comfy Cloud" -> https://comfy.org/cloud?utm_source=docs)
// is rendered by the docs platform from docs.json, so variant assignment
// happens here in a small JS hook that reads the PostHog flag. Mintlify
// inlines every root-level .js file on all pages, so this runs site-wide.
//
// Flag: docs-cta-copy (string flag, experiment #448700 "Docs CTA copy")
//   - "test"    -> label becomes "Try Cloud for free" (homepage-style copy)
//   - "control" -> keep "Comfy Cloud" (the docs.json default)
//   - unset     -> "Comfy Cloud" (control)
//
// Flag plumbing: docs.comfy.org's PostHog runs through Mintlify's proxy
// (api_host = https://ph.mintlify.com) and docs has never evaluated a
// feature flag, so the proxy's flags endpoint is unverified. If the proxy
// does not forward flag evaluations, getFeatureFlag() returns undefined and
// the experiment would silently record 100% control. To remove that failure
// mode, this hook creates its own posthog-js instance
// (window.posthog.docsCta, via the named-instance init) pointed directly at
// PostHog's ingestion host, with autocapture/pageviews disabled so nothing
// is double-counted, and its distinct_id synced to the main instance so
// exposure and click events attach to the same person as the pageviews and
// docs.navitem.cta_click events. It only falls back to Mintlify's proxied
// instance if the dedicated one cannot be created.
//
// The href is intentionally unchanged in both variants. Clicks to
// comfy.org/cloud already convert well (27% of clickers sign up); the test
// isolates the copy, not the destination.
//
// Exposure: calling getFeatureFlag() automatically captures the
// $feature_flag_called event (deduplicated per session), carrying the flag
// key and the assigned response. Clicks are captured explicitly as
// "docs_nav_cta_clicked" with the assigned variant so the test can be
// analyzed against docs-attributed signups in PostHog.

(function () {
  "use strict";

  var FLAG_KEY = "docs-cta-copy";
  // Direct PostHog ingestion host, bypassing Mintlify's ph.mintlify.com proxy.
  var INGESTION_HOST = "https://us.i.posthog.com";
  var INSTANCE_NAME = "docsCta";
  // Public client key, same value as docs.json -> integrations.posthog.apiKey.
  var FALLBACK_TOKEN = "phc_iKfK86id4xVYws9LybMje0h44eGtfwFgRPIBehmy8rO";
  var CTA_HREF = "https://comfy.org/cloud?utm_source=docs";
  var VARIANTS = {
    control: { label: "Comfy Cloud" },
    test: { label: "Try Cloud for free" }
  };
  // Labels we are allowed to swap, so re-renders and flag flips stay idempotent.
  var KNOWN_LABELS = ["Comfy Cloud", "Try Cloud for free"];
  var assignedVariant = "control";
  var flagMachineReady = false;
  var safetyTimer = null;

  function mainPh() {
    return window.posthog || null;
  }

  function dedicatedPh() {
    var m = mainPh();
    return m && m[INSTANCE_NAME] ? m[INSTANCE_NAME] : null;
  }

  // The instance used to evaluate flags and capture events.
  function activePh() {
    return dedicatedPh() || mainPh();
  }

  function variantLabel(variant) {
    return (VARIANTS[variant] || VARIANTS.control).label;
  }

  // Keep the dedicated instance's distinct_id in sync with the main
  // (Mintlify) instance so exposure and click events land on the same person
  // as the pageviews and docs.navitem.cta_click events. No-op once synced.
  function ensureIdentity(ph) {
    if (!ph || !ph.identify || !ph.get_distinct_id) return;
    try {
      var main = mainPh();
      var mainId = main && main.get_distinct_id ? main.get_distinct_id() : "";
      var ownId = ph.get_distinct_id() || "";
      if (mainId && ownId !== mainId) ph.identify(mainId);
    } catch (e) {
      // Identity sync is best-effort; the experiment still records.
    }
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
    var ph = activePh();
    try {
      if (ph && ph.getFeatureFlag) {
        var raw = ph.getFeatureFlag(FLAG_KEY);
        if (raw === "control" || raw === "test") {
          variant = raw;
        }
      }
    } catch (e) {
      // Flag lookup failed: keep the control copy.
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

  // Called whenever a flag-capable instance becomes available. Idempotent;
  // re-applies the variant each time so a late-arriving instance corrects an
  // early control fallback.
  function onFlagMachineReady(ph) {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    ensureIdentity(ph);
    applyVariant();
    if (!flagMachineReady) {
      flagMachineReady = true;
      watchNav();
    }
  }

  // Create the dedicated posthog-js instance pointed at the direct ingestion
  // host. Returns true when it was created; its loaded callback then drives
  // onFlagMachineReady.
  function initDedicated() {
    var m = mainPh();
    if (!m || !m.init || dedicatedPh()) return false;
    try {
      var token = (m.config && m.config.token) || FALLBACK_TOKEN;
      m.init(
        token,
        {
          api_host: INGESTION_HOST,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          loaded: function (ph) {
            ensureIdentity(ph);
            onFlagMachineReady(ph);
          }
        },
        INSTANCE_NAME
      );
      return !!m[INSTANCE_NAME];
    } catch (e) {
      return false;
    }
  }

  function start() {
    var m = mainPh();
    if (m && m.config) {
      // Main instance is already initialized.
      if (!initDedicated()) {
        // Fallback: evaluate flags through the main (Mintlify) instance.
        if (m.onFeatureFlags) {
          m.onFeatureFlags(function () {
            onFlagMachineReady(m);
          });
        } else {
          onFlagMachineReady(m);
        }
      }
      // Safety net: never hang on a stub that does not load.
      safetyTimer = setTimeout(function () {
        onFlagMachineReady(m);
      }, 6000);
      return;
    }
    // PostHog loads async via the docs platform integration. Poll briefly so
    // the hook still runs if it arrives late, then fall back to control.
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (mainPh() && mainPh().config) {
        clearInterval(timer);
        start();
      } else if (tries >= 100) {
        clearInterval(timer);
        onFlagMachineReady(null);
      }
    }, 100);
  }

  // Record CTA clicks with the assigned variant for funnel analysis.
  document.addEventListener(
    "click",
    function (event) {
      var ph = activePh();
      if (!ph || !ph.capture) return;
      var target =
        event.target instanceof Element
          ? event.target.closest('a[href="' + CTA_HREF + '"]')
          : null;
      if (!target) return;
      ensureIdentity(ph);
      ph.capture("docs_nav_cta_clicked", {
        variant: assignedVariant,
        label: variantLabel(assignedVariant),
        href: target.href
      });
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
