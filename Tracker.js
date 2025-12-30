(function () {
  try {
    /* ---------------- CONFIG ---------------- */
    const API_URL = "https://insightengine-production.up.railway.app/collect";
    const BATCH_SIZE = 10;
    const FLUSH_INTERVAL = 5000; // 5 sec
    const SESSION_TIMEOUT = 30 * 60 * 1000;
    const SESSION_KEY = "__saas_tracker_session";

    const script = document.currentScript;
    const PROJECT_ID = script?.getAttribute("data-project");

    if (!PROJECT_ID || !navigator.sendBeacon) return;

    /* ---------------- SESSION ---------------- */
    function getSessionId() {
      const now = Date.now();
      let session = localStorage.getItem(SESSION_KEY);

      if (session) {
        session = JSON.parse(session);
        if (now - session.last < SESSION_TIMEOUT) {
          session.last = now;
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          return session.id;
        }
      }

      const newSession = {
        id: crypto.randomUUID(),
        last: now
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      return newSession.id;
    }

    /* ---------------- EVENT QUEUE ---------------- */
    let queue = [];
    let flushTimer = null;

    function enqueue(type, data = {}) {
      queue.push({
        projectId: PROJECT_ID,
        sessionId: getSessionId(),
        type,
        page: location.pathname,
        referrer: document.referrer,
        ts: Date.now(),
        ...data
      });

      if (queue.length >= BATCH_SIZE) {
        flush();
      }
    }

    function flush() {
      if (!queue.length) return;
      console.log(queue);
      const payload = JSON.stringify(queue);
      queue = [];
      navigator.sendBeacon(API_URL, payload);
    }

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flush();
        flushTimer = null;
      }, FLUSH_INTERVAL);
    }

    /* ---------------- PAGEVIEW ---------------- */
    function trackPageView() {
      enqueue("pageview");
      scheduleFlush();
    }

    /* SPA SUPPORT */
    const originalPushState = history.pushState;
    history.pushState = function () {
      originalPushState.apply(history, arguments);
      trackPageView();
    };
    window.addEventListener("popstate", trackPageView);

    /* ---------------- CLICK TRACKING ---------------- */
    document.addEventListener("click", function (e) {
      const el = e.target;
      enqueue("click", {
        tag: el.tagName,
        id: el.id || null,
        class: el.className || null
      });
      scheduleFlush();
    });

    /* ---------------- SCROLL DEPTH ---------------- */
    let lastScrollMark = 0;
    window.addEventListener(
      "scroll",
      function () {
        const scrolled =
          (window.scrollY + window.innerHeight) /
          document.documentElement.scrollHeight;

        const percent = Math.floor(scrolled * 100);

        if (percent >= lastScrollMark + 25) {
          lastScrollMark = percent;
          enqueue("scroll", { percent });
          scheduleFlush();
        }
      },
      { passive: true }
    );

    /* ---------------- PAGE LOAD ---------------- */
    trackPageView();

    /* ---------------- FLUSH ON EXIT ---------------- */
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });

  } catch (e) {
    // never break the website
  }
})();
