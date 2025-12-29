// Giscus comment system integration script for Mintlify (SPA-aware)
(function() {
  'use strict';
  
  let currentPath = '';
  let giscusLoaded = false;
  let intersectionObserver = null;
  let themeObserver = null;
  let loadingTimeout = null;
  
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
      
      /* Lazy loading placeholder */
      .giscus-placeholder {
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted, #666);
        font-size: 0.875rem;
        border: 1px dashed var(--border-color, #e5e7eb);
        border-radius: 8px;
        margin: 1rem 0;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .giscus-placeholder:hover {
        background: var(--hover-bg, #f9fafb);
        border-color: var(--primary-color, #3b82f6);
      }
      
      .giscus-placeholder-content {
        text-align: center;
        line-height: 1.5;
      }
      
      .giscus-placeholder-icon {
        font-size: 2rem;
        margin-bottom: 0.5rem;
        opacity: 0.5;
      }
      
      /* Discussion notice styling */
      .giscus-notice {
        background: var(--notice-bg, #f8fafc);
        border: 1px solid var(--notice-border, #e2e8f0);
        border-radius: 8px;
        padding: 1rem;
        margin: 1rem 0;
        color: var(--notice-text, #475569);
        font-size: 0.875rem;
        line-height: 1.5;
      }
      
      .giscus-notice-title {
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--notice-title, #334155);
      }
      
      .giscus-notice-button {
        background: var(--primary-color, #3b82f6);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        cursor: pointer;
        font-size: 0.875rem;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        transition: background-color 0.2s ease;
      }
      
      .giscus-notice-button:hover {
        background: var(--primary-color-hover, #2563eb);
      }
      
      .giscus-notice-button.secondary {
        background: var(--secondary-color, #6b7280);
      }
      
      .giscus-notice-button.secondary:hover {
        background: var(--secondary-color-hover, #4b5563);
      }
      
      /* Dark mode notice styling */
      @media (prefers-color-scheme: dark) {
        .giscus-notice {
          background: var(--notice-bg-dark, #1e293b);
          border-color: var(--notice-border-dark, #334155);
          color: var(--notice-text-dark, #94a3b8);
        }
        
        .giscus-notice-title {
          color: var(--notice-title-dark, #e2e8f0);
        }
      }
      
      [data-theme="dark"] .giscus-notice,
      .dark .giscus-notice {
        background: var(--notice-bg-dark, #1e293b);
        border-color: var(--notice-border-dark, #334155);
        color: var(--notice-text-dark, #94a3b8);
      }
      
      [data-theme="dark"] .giscus-notice-title,
      .dark .giscus-notice-title {
        color: var(--notice-title-dark, #e2e8f0);
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
    
    // Clean up observers
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    
    if (themeObserver) {
      themeObserver.disconnect();
      themeObserver = null;
    }
    
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }
    
    giscusLoaded = false;
  }

  // Create placeholder for lazy loading
  function createGiscusPlaceholder() {
    const isChinesePage = window.location.pathname.includes('/zh-CN/') || window.location.pathname.includes('/cn/');
    const placeholderText = isChinesePage 
      ? '💬 点击或滚动到此处加载评论'
      : '💬 Click or scroll here to load comments';
    
    const placeholder = document.createElement('div');
    placeholder.className = 'giscus-placeholder';
    placeholder.innerHTML = `
      <div class="giscus-placeholder-content">
        <div class="giscus-placeholder-icon">💬</div>
        <div>${placeholderText}</div>
      </div>
    `;
    
    // Click to load
    placeholder.addEventListener('click', () => {
      loadGiscusContent(placeholder.parentElement);
    });
    
    return placeholder;
  }

  // Setup intersection observer for lazy loading
  function setupLazyLoading(container) {
    if (!window.IntersectionObserver || giscusLoaded) return;
    
    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !giscusLoaded) {
          loadGiscusContent(container);
          intersectionObserver.disconnect();
        }
      });
    }, {
      rootMargin: '200px 0px', // Start loading 200px before the element comes into view
      threshold: 0
    });
    
    intersectionObserver.observe(container);
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
  
  // Get current theme from Mintlify
  function getCurrentTheme() {
    // Check for Mintlify's theme class on html or body
    const html = document.documentElement;
    const body = document.body;
    
    // Mintlify typically uses data attributes or classes
    if (html.classList.contains('dark') || body.classList.contains('dark')) {
      return 'dark';
    } else if (html.classList.contains('light') || body.classList.contains('light')) {
      return 'light';
    } else if (html.dataset.theme === 'dark' || body.dataset.theme === 'dark') {
      return 'dark';
    } else if (html.dataset.theme === 'light' || body.dataset.theme === 'light') {
      return 'light';
    }
    
    // Fallback to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Update giscus theme
  function updateGiscusTheme(theme) {
    const giscusFrame = document.querySelector('iframe.giscus-frame');
    if (giscusFrame) {
      const message = {
        giscus: {
          setConfig: {
            theme: theme === 'dark' ? 'dark' : 'light'
          }
        }
      };
      giscusFrame.contentWindow.postMessage(message, 'https://giscus.app');
    }
  }

  // Set up theme change observer
  function setupThemeObserver() {
    // Don't create multiple observers
    if (themeObserver) {
      return;
    }
    
    // Watch for changes to the document element's attributes and classes
    themeObserver = new MutationObserver((mutations) => {
      let themeChanged = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || 
             mutation.attributeName === 'data-theme' ||
             mutation.attributeName === 'data-color-scheme')) {
          themeChanged = true;
        }
      });
      
      if (themeChanged) {
        const newTheme = getCurrentTheme();
        updateGiscusTheme(newTheme);
      }
    });

    // Observe both html and body elements for theme changes
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme']
    });
    
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme']
    });

    // Also listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      // Only update if no explicit theme is set
      const html = document.documentElement;
      const body = document.body;
      if (!html.classList.contains('dark') && !html.classList.contains('light') &&
          !body.classList.contains('dark') && !body.classList.contains('light') &&
          !html.dataset.theme && !body.dataset.theme) {
        const newTheme = getCurrentTheme();
        updateGiscusTheme(newTheme);
      }
    });
  }

  // Generate GitHub Discussions URL for current page
  function generateDiscussionUrl() {
    const repoOwner = 'Comfy-Org';
    const repoName = 'docs';
    const currentPath = window.location.pathname;
    const currentTitle = document.title || 'Discussion';
    const currentUrl = window.location.href;
    
    // Extract meaningful part of the path for search
    const pathSegments = currentPath.split('/').filter(Boolean);
    let searchQuery = '';
    
    if (pathSegments.length > 0) {
      // Use the complete path as search term, keeping language prefixes
      // Example: /zh-CN/development/core-concepts/workflow -> "zh-CN development core concepts workflow"
      searchQuery = pathSegments
        .join(' ')
        .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .trim();
    }
    
    // If no meaningful path, use page title
    if (!searchQuery && currentTitle) {
      searchQuery = currentTitle.replace(/[^\w\s]/g, '').trim();
    }
    
    // Create search URL to find existing discussions
    if (searchQuery) {
      const encodedQuery = encodeURIComponent(searchQuery);
      return `https://github.com/${repoOwner}/${repoName}/discussions?discussions_q=${encodedQuery}`;
    }
    
    // Fallback to discussions main page
    return `https://github.com/${repoOwner}/${repoName}/discussions`;
  }
  
  // Generate URL for creating a new discussion with context
  function generateNewDiscussionUrl() {
    const repoOwner = 'Comfy-Org';
    const repoName = 'docs';
    const currentPath = window.location.pathname;
    const currentTitle = document.title || 'Discussion';
    const currentUrl = window.location.href;
    
    // Create discussion title based on complete page path
    let discussionTitle = currentTitle;
    if (currentPath && currentPath !== '/') {
      const pathSegments = currentPath.split('/').filter(Boolean);
      
      if (pathSegments.length > 0) {
        // Create title from complete path, keeping language prefixes
        // Example: /zh-CN/development/core-concepts/workflow -> "zh-CN/development/core-concepts/workflow"
        const pathTitle = pathSegments.join('/');
        discussionTitle = pathTitle;
      }
    }
    
    // Create discussion body with context
    const body = `Discussion for: ${currentTitle}\nPage: ${currentUrl}\nPath: ${currentPath}`;
    const encodedTitle = encodeURIComponent(discussionTitle);
    const encodedBody = encodeURIComponent(body);
    
    return `https://github.com/${repoOwner}/${repoName}/discussions/new?category=general&title=${encodedTitle}&body=${encodedBody}`;
  }

  // Show friendly discussion notice
  function showGiscusNotice(container, noticeType = 'rate_limit') {
    const discussionUrl = generateDiscussionUrl();
    const newDiscussionUrl = generateNewDiscussionUrl();
    
    const noticeMessages = {
      rate_limit: {
        en: {
          title: '💬 Join the Discussion',
          message: 'Comments are temporarily unavailable due to high traffic.',
          suggestion: 'Please first check if there are existing discussions about this page. If you can\'t find any relevant discussions, then start a new one to connect your comments with this page.',
          discussionLink: 'Find Related Discussions',
          newDiscussionLink: 'Start New Discussion'
        },
        zh: {
          title: '💬 参与讨论', 
          message: '由于访问量较高，评论功能暂时不可用。',
          suggestion: '请先查找是否有关于此页面的相关讨论。如果找不到相关讨论，再发起新的讨论以便将评论与此页面关联。',
          discussionLink: '查找相关讨论',
          newDiscussionLink: '发起新讨论'
        }
      },
      network: {
        en: {
          title: '💬 Join the Discussion',
          message: 'Comments could not be loaded at this time.',
          suggestion: 'Please first check if there are existing discussions about this page. If you can\'t find any relevant discussions, then start a new one to connect your comments with this page.',
          discussionLink: 'Find Related Discussions',
          newDiscussionLink: 'Start New Discussion'
        },
        zh: {
          title: '💬 参与讨论',
          message: '评论暂时无法加载。',
          suggestion: '请先查找是否有关于此页面的相关讨论。如果找不到相关讨论，再发起新的讨论以便将评论与此页面关联。',
          discussionLink: '查找相关讨论',
          newDiscussionLink: '发起新讨论'
        }
      }
    };
    
    const isChinesePage = window.location.pathname.includes('/zh-CN/') || window.location.pathname.includes('/cn/');
    const lang = isChinesePage ? 'zh' : 'en';
    const notice = noticeMessages[noticeType][lang];
    
    const noticeDiv = document.createElement('div');
    noticeDiv.className = 'giscus-notice';
    noticeDiv.innerHTML = `
      <div class="giscus-notice-title">${notice.title}</div>
      <div>${notice.message}</div>
      <div style="margin-top: 0.5rem; opacity: 0.8;">${notice.suggestion}</div>
      <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <a href="${discussionUrl}" target="_blank" class="giscus-notice-button">${notice.discussionLink}</a>
        <a href="${newDiscussionUrl}" target="_blank" class="giscus-notice-button secondary">${notice.newDiscussionLink}</a>
      </div>
    `;
    
    container.innerHTML = '';
    container.appendChild(noticeDiv);
    container.classList.remove('loading');
    container.classList.add('loaded');
  }

  // Legacy retry function (may not be needed now)
  window.retryGiscus = function() {
    const container = document.querySelector('.giscus-container');
    if (!container) return;
    
    // Simply reload the giscus content
    giscusLoaded = false; // Reset the loaded flag
    loadGiscusContent(container);
  };

  // Listen for giscus messages to detect rate limit errors
  function setupGiscusErrorListener() {
    window.addEventListener('message', function(event) {
      if (event.origin !== 'https://giscus.app') return;
      
      const message = event.data;
      console.log('Giscus message received:', message); // Debug log
      
      const container = document.querySelector('.giscus-container');
      if (!container) return;
      
      // Check for various error patterns
      if (message && message.giscus) {
        // Standard giscus error format
        if (message.giscus.error) {
          const errorType = message.giscus.error.type;
          console.warn('Giscus error detected:', errorType, message.giscus.error);
          
          if (errorType === 'rate_limit' || errorType === 'rate-limit' || errorType === 'RATE_LIMITED') {
            showGiscusNotice(container, 'rate_limit');
          } else {
            showGiscusNotice(container, 'network');
          }
        }
        
        // Check for discussion data with error indicators
        if (message.giscus.discussion === null && message.giscus.viewer === null) {
          // This might indicate a rate limit or auth issue
          console.warn('Giscus: No discussion data, possibly rate limited');
          setTimeout(() => {
            if (container.querySelector('.giscus-frame')) {
              const iframe = container.querySelector('.giscus-frame');
              if (iframe && iframe.contentDocument) {
                const errorElements = iframe.contentDocument.querySelectorAll('[class*="error"], [class*="Error"]');
                if (errorElements.length > 0) {
                  console.warn('Giscus: Error elements found in iframe');
                  showGiscusNotice(container, 'rate_limit');
                }
              }
            }
          }, 3000);
        }
      }
      
      // Also check for direct error messages in the content
      if (typeof message === 'string' && message.includes('rate limit')) {
        console.warn('Giscus: Rate limit detected in string message');
        showGiscusNotice(container, 'rate_limit');
      }
    });
    
    // Additional error detection: Monitor iframe content changes
    const checkForErrors = () => {
      const container = document.querySelector('.giscus-container');
      const iframe = document.querySelector('.giscus-frame');
      
      if (iframe && container) {
        try {
          // Check if iframe has loaded and has error content
          setTimeout(() => {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
              const bodyText = iframeDoc.body ? iframeDoc.body.textContent || '' : '';
              if (bodyText.includes('rate limit') || bodyText.includes('API rate limit') || bodyText.includes('exceeded')) {
                console.warn('Giscus: Rate limit detected in iframe content');
                showGiscusNotice(container, 'rate_limit');
              } else if (bodyText.includes('error occurred')) {
                console.warn('Giscus: Generic error detected in iframe content');
                showGiscusNotice(container, 'rate_limit'); // Assume it's rate limit for now
              }
            }
          }, 5000); // Check after 5 seconds
        } catch (e) {
          // Cross-origin restrictions, can't access iframe content
          console.log('Cannot access iframe content due to CORS');
        }
      }
    };
    
    // Run error check periodically
    setTimeout(checkForErrors, 6000);
  }

  // Load actual giscus content
  function loadGiscusContent(container) {
    if (giscusLoaded) return;
    giscusLoaded = true;
    
    // Clear placeholder
    container.innerHTML = '';
    container.className = 'giscus-container loading';
    
    // Get current theme and path info
    const currentTheme = getCurrentTheme();
    const newPath = window.location.pathname;
    
    // Create giscus script
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'Comfy-Org/docs');
    script.setAttribute('data-repo-id', 'R_kgDOLlassQ'); // Replace with real ID
    script.setAttribute('data-category', 'Announcements');
    script.setAttribute('data-category-id', 'DIC_kwDOLlassc4CtQoz'); // Replace with real ID
    script.setAttribute('data-mapping', 'pathname');
    script.setAttribute('data-strict', '1');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'bottom');
    script.setAttribute('data-theme', currentTheme === 'dark' ? 'dark' : 'light');
    
    // Set language based on path - only Chinese pages should be marked as Chinese
    const isChinesePage = newPath.includes('/zh-CN/') || newPath.includes('/cn/');
    const giscusLang = isChinesePage ? 'zh-CN' : 'en';
    script.setAttribute('data-lang', giscusLang);
    
    // Debug logging
    console.log('Giscus: Current path:', newPath);
    console.log('Giscus: Is Chinese page:', isChinesePage);
    console.log('Giscus: Language set to:', giscusLang);
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    
    // Handle giscus load event and errors
    script.onload = () => {
      // Clear the loading timeout since script loaded successfully
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      
      setTimeout(() => {
        container.classList.remove('loading');
        container.classList.add('loaded');
        
        // Set up theme observer after giscus loads
        setupThemeObserver();
      }, 1000);
    };
    
    script.onerror = () => {
      // Clear the loading timeout since we got an error
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      
      console.error('Giscus: Failed to load giscus script');
      showGiscusNotice(container, 'network');
    };
    
    // Set up a timeout to detect if giscus fails to load
    loadingTimeout = setTimeout(() => {
      // Check if giscus is still loading or showing an error
      const iframe = container.querySelector('.giscus-frame');
      const hasError = container.querySelector('.giscus-error');
      
      if (container.classList.contains('loading') || (iframe && !hasError)) {
        // Check iframe content for errors if possible
        try {
          if (iframe && iframe.contentDocument) {
            const iframeDoc = iframe.contentDocument;
            const bodyText = iframeDoc.body ? iframeDoc.body.textContent || '' : '';
            
            if (bodyText.includes('error occurred') || bodyText.includes('rate limit') || bodyText.includes('exceeded')) {
              console.warn('Giscus: Error detected in iframe after timeout');
              showGiscusNotice(container, 'rate_limit');
            }
          } else {
            console.warn('Giscus: Loading timeout, possibly rate limited');
            showGiscusNotice(container, 'rate_limit');
          }
        } catch (e) {
          // Can't access iframe due to CORS, assume rate limit
          console.warn('Giscus: Loading timeout, assuming rate limited');
          showGiscusNotice(container, 'rate_limit');
        }
      }
      loadingTimeout = null;
    }, 8000); // Reduced to 8 second timeout for faster detection
    
    container.appendChild(script);
  }

  // Create and insert giscus container with lazy loading
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
    
    // Create giscus container with placeholder
    const giscusContainer = document.createElement('div');
    giscusContainer.className = 'giscus-container';
    
    // Add placeholder for lazy loading
    const placeholder = createGiscusPlaceholder();
    giscusContainer.appendChild(placeholder);
    
    // Insert at the end of content, but before any navigation
    const navElements = contentContainer.querySelectorAll('nav, .pagination, [class*="nav"]:last-child');
    if (navElements.length > 0) {
      const lastNav = navElements[navElements.length - 1];
      contentContainer.insertBefore(giscusContainer, lastNav);
    } else {
      contentContainer.appendChild(giscusContainer);
    }
    
    // Setup lazy loading
    setupLazyLoading(giscusContainer);
  }
  
  // Handle SPA navigation
  function setupSPAHandling() {
    // Listen for URL changes (SPA navigation)
    let lastUrl = location.href;
    
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(loadGiscus, 800); // Increased delay for content to load
      }
    }).observe(document, {subtree: true, childList: true});
    
    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      setTimeout(loadGiscus, 800);
    });
    
    // Listen for pushstate/replacestate (modern SPA frameworks)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(loadGiscus, 800);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(loadGiscus, 800);
    };
  }
  
  // Debug functions for testing notice messages
  window.giscusDebug = {
    // Force show rate limit notice
    showRateLimitNotice: () => {
      const container = document.querySelector('.giscus-container');
      if (container) {
        showGiscusNotice(container, 'rate_limit');
      } else {
        console.warn('No giscus container found. Wait for page to load giscus placeholder first.');
      }
    },
    
    // Force show network notice
    showNetworkNotice: () => {
      const container = document.querySelector('.giscus-container');
      if (container) {
        showGiscusNotice(container, 'network');
      } else {
        console.warn('No giscus container found. Wait for page to load giscus placeholder first.');
      }
    },
    
    // Reset to placeholder
    resetToPlaceholder: () => {
      const container = document.querySelector('.giscus-container');
      if (container) {
        container.innerHTML = '';
        const placeholder = createGiscusPlaceholder();
        container.appendChild(placeholder);
        setupLazyLoading(container);
        giscusLoaded = false;
      }
    },
    
    // Test URL generation
    testUrls: () => {
      const searchUrl = generateDiscussionUrl();
      const newUrl = generateNewDiscussionUrl();
      console.log('Current page path:', window.location.pathname);
      console.log('Search URL:', searchUrl);
      console.log('New Discussion URL:', newUrl);
      return { searchUrl, newUrl };
    }
  };

  // Initialize
  function init() {
    addStyles();
    setupSPAHandling();
    setupGiscusErrorListener();
    
    // Add debug info
    console.log('Giscus Debug Commands Available:');
    console.log('- giscusDebug.showRateLimitNotice() - Show rate limit notice');
    console.log('- giscusDebug.showNetworkNotice() - Show network notice'); 
    console.log('- giscusDebug.resetToPlaceholder() - Reset to placeholder');
    console.log('- giscusDebug.testUrls() - Test URL generation for current page');
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(loadGiscus, 1500); // Longer delay on initial load
      });
    } else {
      setTimeout(loadGiscus, 1500); // Longer delay on initial load  
    }
  }
  
  init();
})();