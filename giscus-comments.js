// Giscus comment system integration script for Mintlify (SPA-aware)
(function() {
  'use strict';
  
  let currentPath = '';
  
  // Add CSS styles once
  function addStyles() {
    if (document.querySelector('#giscus-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'giscus-styles';
    style.textContent = `
      .giscus-container {
        margin-top: 3rem;
        padding-top: 2rem;
        border-top: 1px solid var(--border-color, #e5e7eb);
        max-width: none !important;
        width: 100%;
        box-sizing: border-box;
        clear: both;
        position: relative;
        z-index: 1;
      }
      
      /* Responsive design and sidebar conflict prevention */
      .giscus-container .giscus,
      .giscus-container .giscus-frame {
        max-width: 100% !important;
        width: 100% !important;
      }
      
      /* Ensure proper width within content area */
      main .giscus-container {
        max-width: calc(100vw - 300px); /* Account for sidebar */
      }
      
      @media (max-width: 1024px) {
        main .giscus-container {
          max-width: 100%;
        }
      }
      
      @media (max-width: 768px) {
        .giscus-container {
          margin-left: -1rem;
          margin-right: -1rem;
          padding-left: 1rem;
          padding-right: 1rem;
        }
      }
      
      /* Hide giscus container initially to prevent flash */
      .giscus-container.loading {
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .giscus-container.loaded {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Remove existing giscus instances
  function cleanupGiscus() {
    const existingContainers = document.querySelectorAll('.giscus-container');
    existingContainers.forEach(container => container.remove());
    
    // Also remove any orphaned giscus elements
    const giscusElements = document.querySelectorAll('.giscus, giscus-widget, [class*="giscus"]');
    giscusElements.forEach(el => {
      if (!el.closest('.giscus-container')) {
        el.remove();
      }
    });
  }
  
  // Find the best content container for giscus
  function findContentContainer() {
    // Wait for content to be ready
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 20;
      
      function tryFind() {
        // Specific selectors for Mintlify content structure
        const selectors = [
          // Mintlify main content container - this is the key one!
          '.mdx-content.prose',
          '.mdx-content',
          // Fallback selectors
          'main [class*="prose"]:not([class*="nav"]):not([class*="sidebar"])',
          'main article:not([class*="nav"])',
          'main > div > div:last-child', // Common Mintlify structure
          '[role="main"] > div:last-child',
          'main .content',
          'main'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const textContent = element.textContent?.trim() || '';
            const noExistingGiscus = !element.querySelector('.giscus-container');
            
            // Special handling for .mdx-content - this is our primary target
            if (element.classList.contains('mdx-content')) {
              if (textContent.length > 50 && noExistingGiscus) {
                console.log('Giscus: Found mdx-content container', element);
                resolve(element);
                return;
              }
            } else {
              // Stricter requirements for other selectors
              const hasSubstantialContent = textContent.length > 200;
              const notNavigation = !element.closest('[class*="nav"], nav, .sidebar');
              
              if (hasSubstantialContent && notNavigation && noExistingGiscus) {
                console.log('Giscus: Found content container', selector, element);
                resolve(element);
                return;
              }
            }
          }
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryFind, 250);
        } else {
          resolve(null);
        }
      }
      
      tryFind();
    });
  }
  
  // Create and insert giscus
  async function loadGiscus() {
    const newPath = window.location.pathname;
    
    // Exclude paths that should not have comments
    const excludedPaths = ['/', '/zh-CN', '/zh-CN/'];

    // Skip if current path is in excluded list or contains API/search paths
    if (excludedPaths.includes(newPath) || newPath.includes('/api/') || newPath.includes('/search')) {
      return;
    }
    
    currentPath = newPath;
    cleanupGiscus();
    
    const contentContainer = await findContentContainer();
    if (!contentContainer) {
      console.warn('Giscus: Could not find suitable content container');
      return;
    }
    
    // Create giscus container
    const giscusContainer = document.createElement('div');
    giscusContainer.className = 'giscus-container loading';
    
    // Create giscus script
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'Comfy-Org/docs');
    script.setAttribute('data-repo-id', 'R_kgDOLiw1Tg'); // Replace with real ID
    script.setAttribute('data-category', 'General');
    script.setAttribute('data-category-id', 'DIC_kwDOLiw1Ts4CdnQU'); // Replace with real ID
    script.setAttribute('data-mapping', 'pathname');
    script.setAttribute('data-strict', '0');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'bottom');
    script.setAttribute('data-theme', 'preferred_color_scheme');
    
    // Set language based on path
    const isChinesePage = newPath.includes('/zh-CN/') || newPath.includes('/cn/');
    script.setAttribute('data-lang', isChinesePage ? 'zh-CN' : 'en');
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    
    // Handle giscus load event
    script.onload = () => {
      setTimeout(() => {
        giscusContainer.classList.remove('loading');
        giscusContainer.classList.add('loaded');
      }, 1000);
    };
    
    giscusContainer.appendChild(script);
    
    // Insert at the end of content, but before any navigation
    const navElements = contentContainer.querySelectorAll('nav, .pagination, [class*="nav"]:last-child');
    if (navElements.length > 0) {
      const lastNav = navElements[navElements.length - 1];
      contentContainer.insertBefore(giscusContainer, lastNav);
    } else {
      contentContainer.appendChild(giscusContainer);
    }
  }
  
  // Handle SPA navigation
  function setupSPAHandling() {
    // Listen for URL changes (SPA navigation)
    let lastUrl = location.href;
    
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(loadGiscus, 500); // Delay for content to load
      }
    }).observe(document, {subtree: true, childList: true});
    
    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(loadGiscus, 500);
    });
    
    // Listen for pushstate/replacestate (modern SPA frameworks)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(loadGiscus, 500);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(loadGiscus, 500);
    };
  }
  
  // Initialize
  function init() {
    addStyles();
    setupSPAHandling();
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(loadGiscus, 1000);
      });
    } else {
      setTimeout(loadGiscus, 1000);
    }
  }
  
  init();
})();