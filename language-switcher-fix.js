/**
 * Language Switcher Route Fix
 *
 * This script fixes Mintlify's language switcher to properly navigate
 * between corresponding pages in different languages instead of always
 * going to the homepage.
 *
 * Language mapping:
 * - English (en): /path/to/page
 * - Chinese (cn): /zh-CN/path/to/page
 */

(function() {
  'use strict';

  // Language configuration
  const LANGUAGE_CONFIG = {
    en: {
      code: 'en',
      prefix: '',  // English pages have no prefix
      label: 'English'
    },
    cn: {
      code: 'cn',
      prefix: '/zh-CN',  // Chinese pages are prefixed with /zh-CN
      label: '中文'
    }
  };

  /**
   * Get current language from URL path
   */
  function getCurrentLanguage() {
    const path = window.location.pathname;
    if (path.startsWith('/zh-CN')) {
      return 'cn';
    }
    return 'en';
  }

  /**
   * Get current page path without language prefix
   */
  function getPagePath() {
    const path = window.location.pathname;
    const currentLang = getCurrentLanguage();
    const prefix = LANGUAGE_CONFIG[currentLang].prefix;

    if (prefix && path.startsWith(prefix)) {
      return path.substring(prefix.length) || '/';
    }
    return path;
  }

  /**
   * Convert path to target language
   */
  function convertPathToLanguage(targetLang) {
    const pagePath = getPagePath();
    const targetPrefix = LANGUAGE_CONFIG[targetLang].prefix;

    // Construct the new path
    let newPath = targetPrefix + pagePath;

    // Ensure proper path formatting
    if (!newPath.startsWith('/')) {
      newPath = '/' + newPath;
    }

    // Preserve hash and search params
    const hash = window.location.hash;
    const search = window.location.search;

    return newPath + search + hash;
  }

  /**
   * Fix language switcher links
   */
  function fixLanguageSwitcher() {
    // Wait for the DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixLanguageSwitcher);
      return;
    }

    // Try multiple times in case the switcher loads dynamically
    let attempts = 0;
    const maxAttempts = 20;

    const tryFix = () => {
      attempts++;

      // Look for the language switcher button and its dropdown menu
      const localizationButton = document.querySelector('#localization-select-trigger');

      if (!localizationButton) {
        if (attempts < maxAttempts) {
          setTimeout(tryFix, 300);
        }
        return;
      }

      // Find the dropdown menu that appears when clicking the button
      // The menu items are typically rendered in a portal/popup
      const dropdownMenus = document.querySelectorAll('[role="menu"], [role="listbox"], .localization-menu, [id*="localization"]');

      let foundMenu = null;
      dropdownMenus.forEach(menu => {
        const links = menu.querySelectorAll('a');
        if (links.length > 0) {
          foundMenu = menu;
        }
      });

      // If no menu found yet, try to trigger it or wait
      if (!foundMenu) {
        // Look for any links that might be language switcher links
        const allLinks = document.querySelectorAll('a[href="/"], a[href="/zh-CN/"], a[href*="zh-CN"]');

        allLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (!href) return;

          // Check if this looks like a language switcher link
          const linkText = link.textContent.trim().toLowerCase();
          const isLanguageLink = linkText.includes('中文') ||
                                 linkText.includes('chinese') ||
                                 linkText.includes('english') ||
                                 linkText === 'en' ||
                                 linkText === 'cn' ||
                                 href === '/' ||
                                 href === '/zh-CN/' ||
                                 href.startsWith('/zh-CN');

          if (isLanguageLink) {
            foundMenu = link.closest('[role="menu"], [role="listbox"], ul, div');
          }
        });
      }

      if (!foundMenu && attempts < maxAttempts) {
        setTimeout(tryFix, 300);
        return;
      }

      // Process all language links
      const processLinks = () => {
        const allLinks = document.querySelectorAll('a');
        let fixedCount = 0;

        allLinks.forEach(link => {
          if (link.getAttribute('data-language-fixed') === 'true') {
            return; // Already fixed
          }

          const href = link.getAttribute('href');
          if (!href) return;

          const linkText = link.textContent.trim().toLowerCase();

          // Determine which language this link is for
          let targetLang = null;

          if (linkText.includes('中文') || linkText.includes('chinese') || linkText === 'cn') {
            targetLang = 'cn';
          } else if (linkText.includes('english') || linkText === 'en') {
            targetLang = 'en';
          } else if (href === '/' && !link.closest('[class*="footer"]')) {
            // Links to "/" might be English homepage (but not in footer)
            const parent = link.closest('[role="menu"], [role="listbox"], [id*="localization"]');
            if (parent) {
              targetLang = 'en';
            }
          } else if (href.startsWith('/zh-CN') || href === '/zh-CN/') {
            targetLang = 'cn';
          }

          if (targetLang) {
            const currentLang = getCurrentLanguage();

            // Only fix if switching to a different language
            if (targetLang !== currentLang) {
              // Calculate the new path
              const newPath = convertPathToLanguage(targetLang);

              // Update the href attribute
              link.setAttribute('href', newPath);
              link.setAttribute('data-language-fixed', 'true');
              link.setAttribute('data-target-lang', targetLang);

              // Override the click handler
              link.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                const newPath = convertPathToLanguage(targetLang);
                console.log('[Language Switcher] Navigating from', window.location.pathname, 'to', newPath);
                window.location.href = newPath;
              }, true);

              fixedCount++;
            }
          }
        });

        return fixedCount;
      };

      const fixedCount = processLinks();

      if (fixedCount > 0) {
        console.log('[Language Switcher] Fixed', fixedCount, 'language switcher links');
      } else if (attempts < maxAttempts) {
        setTimeout(tryFix, 300);
      }
    };

    tryFix();
  }

  // Run on initial load
  fixLanguageSwitcher();

  // Also run when navigation occurs (for SPA navigation)
  if (window.history && window.history.pushState) {
    const originalPushState = window.history.pushState;
    window.history.pushState = function() {
      originalPushState.apply(window.history, arguments);
      setTimeout(fixLanguageSwitcher, 100);
    };
  }

  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', function() {
    setTimeout(fixLanguageSwitcher, 100);
  });

  // Use MutationObserver to detect when language switcher is added to DOM
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length > 0) {
        fixLanguageSwitcher();
      }
    });
  });

  // Start observing
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  console.log('[Language Switcher] Route fix script loaded');
})();
