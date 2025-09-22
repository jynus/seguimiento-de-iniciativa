// === CONFIGURE THESE TWO URLS ===
const TRIGGER_MATCHES = /^(?:https?:\/\/)?www\.dndbeyond\.com\/games\/[0-9]+/i;
const IFRAME_URL = "https://jynus.com/dnd/";

// Sizing limits
const MIN_W = 200;
const MIN_H = 120;

const extURL = (path) =>
  (typeof chrome !== "undefined" && chrome.runtime?.getURL)
    ? chrome.runtime.getURL(path)
    : browser.runtime.getURL(path);

if (!document.getElementById("corner-iframe-overlay") && TRIGGER_MATCHES.test(location.href)) {
  createOverlay(IFRAME_URL);
}

function createOverlay(src) {
  const container = document.createElement("div");
  container.id = "corner-iframe-overlay";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", "Corner iframe overlay");

  // Header (drag handle + controls)
  const header = document.createElement("div");
  header.id = "corner-iframe-overlay-header";

  const spacer = document.createElement("div");
  spacer.style.flex = "1";

  // Collapse/expand (icon)
  const collapseBtn = document.createElement("button");
  collapseBtn.className = "cio-btn icon";
  collapseBtn.title = "Minimizar";
  collapseBtn.setAttribute("aria-label", "Minimizar");
  const collapseIcon = document.createElement("img");
  collapseIcon.src = extURL("minimize.webp"); // default: expanded → show minimize
  collapseIcon.alt = "";
  collapseBtn.appendChild(collapseIcon);

  // Close (icon)
  const closeBtn = document.createElement("button");
  closeBtn.className = "cio-btn icon";
  closeBtn.title = "Cerrar";
  closeBtn.setAttribute("aria-label", "Cerrar");
  const closeIcon = document.createElement("img");
  closeIcon.src = extURL("close.webp");
  closeIcon.alt = "";
  closeBtn.appendChild(closeIcon);

  header.appendChild(spacer);
  header.appendChild(collapseBtn);
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.id = "corner-iframe-overlay-content";

  const iframe = document.createElement("iframe");
  iframe.id = "corner-iframe-overlay-iframe";
  iframe.src = src;
  iframe.referrerPolicy = "no-referrer";
  iframe.allow = "fullscreen; autoplay; clipboard-read; clipboard-write";
  iframe.loading = "lazy";

  content.appendChild(iframe);
  container.appendChild(header);
  container.appendChild(content);

  // Add 8 resizer handles
  const handles = ["n","e","s","w","ne","nw","se","sw"];
  for (const h of handles) {
    const d = document.createElement("div");
    d.className = `cio-resizer ${h}`;
    container.appendChild(d);
  }

  (document.body || document.documentElement).appendChild(container);

  // Place it initially at top-right (compute left from current width)
  // We must wait a tick to ensure layout width is known
  requestAnimationFrame(() => {
    const rect = container.getBoundingClientRect();
    const left = Math.max(12, window.innerWidth - rect.width - 12);
    container.style.left = `${left}px`;
  });

  // ===== Dragging (by header) =====
  let dragging = false;
  let startX = 0, startY = 0, startTop = 0, startLeft = 0;

  const onMouseDownDrag = (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const r = container.getBoundingClientRect();
    startTop = r.top;
    startLeft = r.left;
    e.preventDefault();
  };
  const onMouseMoveDrag = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newTop = clamp(startTop + dy, 0, window.innerHeight - 40);
    let newLeft = clamp(startLeft + dx, 0, window.innerWidth - 80);

    container.style.top = `${newTop}px`;
    container.style.left = `${newLeft}px`;
  };
  const endDrag = () => { dragging = false; };

  header.addEventListener("mousedown", onMouseDownDrag);
  window.addEventListener("mousemove", onMouseMoveDrag, { passive: true });
  window.addEventListener("mouseup", endDrag);

  // ===== Resizing (8 handles) =====
  let resizing = false;
  let resizeDir = "";
  let rStartX = 0, rStartY = 0;
  let rStartTop = 0, rStartLeft = 0, rStartW = 0, rStartH = 0;

  container.querySelectorAll(".cio-resizer").forEach(handle => {
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizeDir = [...handle.classList].find(c => ["n","e","s","w","ne","nw","se","sw"].includes(c));
      const r = container.getBoundingClientRect();
      rStartX = e.clientX;
      rStartY = e.clientY;
      rStartTop = r.top;
      rStartLeft = r.left;
      rStartW = r.width;
      rStartH = r.height;
      // Temporarily disable iframe pointer events to avoid steals
      iframe.style.pointerEvents = "none";
    });
  });

  const onMouseMoveResize = (e) => {
    if (!resizing) return;

    const dx = e.clientX - rStartX;
    const dy = e.clientY - rStartY;

    let newTop = rStartTop;
    let newLeft = rStartLeft;
    let newW = rStartW;
    let newH = rStartH;

    // Horizontal
    if (resizeDir.includes("e")) {
      newW = clamp(rStartW + dx, MIN_W, window.innerWidth - rStartLeft - 8);
    }
    if (resizeDir.includes("w")) {
      newW = clamp(rStartW - dx, MIN_W, rStartLeft + rStartW - 8);
      newLeft = rStartLeft + dx;
      // prevent moving past left edge
      if (newLeft < 0) { newLeft = 0; newW = rStartLeft + rStartW; }
    }

    // Vertical
    if (resizeDir.includes("s")) {
      newH = clamp(rStartH + dy, MIN_H, window.innerHeight - rStartTop - 8);
    }
    if (resizeDir.includes("n")) {
      newH = clamp(rStartH - dy, MIN_H, rStartTop + rStartH - 8);
      newTop = rStartTop + dy;
      if (newTop < 0) { newTop = 0; newH = rStartTop + rStartH; }
    }

    // Apply
    container.style.width = `${newW}px`;
    container.style.height = `${newH}px`;
    container.style.left = `${newLeft}px`;
    container.style.top = `${newTop}px`;
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    iframe.style.pointerEvents = ""; // restore
  };

  window.addEventListener("mousemove", onMouseMoveResize, { passive: true });
  window.addEventListener("mouseup", endResize);

 // ===== Collapse logic =====
  let collapsed = false;
  const saved = { width: "", height: "", left: "", top: "" };

  collapseBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    if (collapsed) {
      // save current box
      saved.width = container.style.width;
      saved.height = container.style.height;
      saved.left = container.style.left;
      saved.top = container.style.top;

      container.style.width = "220px";
      container.style.height = "40px";
      content.style.display = "none";

      // switch icon to "maximize"
      collapseIcon.src = extURL("maximize.webp");
      collapseBtn.title = "Maximizar";
      collapseBtn.setAttribute("aria-label", "Maximizar");
    } else {
      container.style.width = saved.width || "";
      container.style.height = saved.height || "";
      container.style.left = saved.left || container.style.left;
      container.style.top = saved.top || container.style.top;
      content.style.display = "";

      // switch icon to "minimize"
      collapseIcon.src = extURL("minimize.webp");
      collapseBtn.title = "Minimizar";
      collapseBtn.setAttribute("aria-label", "Minimizar");
    }
  });


  // ===== Close =====
  closeBtn.addEventListener("click", () => container.remove());

  // Utils
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
}
