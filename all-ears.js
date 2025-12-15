(() => {
  // --------- DOM ----------
  const el = (id) => document.getElementById(id);

  const btnStart = el("btnStart");
  const btnStop = el("btnStop");
  const btnClear = el("btnClear");
  const btnUndo = el("btnUndo");
  const btnInsertLive = el("btnInsertLive");

  const btnBrief = el("btnBrief");
  const btnCopyBrief = el("btnCopyBrief");
  const btnDownloadBrief = el("btnDownloadBrief");

  const inputText = el("inputText");
  const liveText = el("liveText");

  const tier = el("tier");
  const industry = el("industry");
  const consent = el("consent");

  const lang = el("lang");
  const continuous = el("continuous");
  const interim = el("interim");

  const wordCount = el("wordCount");
  const micDot = el("micDot");
  const statusText = el("statusText");

  const briefOut = el("briefOut");

  // --------- STATE ----------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;

  let lastSavedText = "";
  let undoStack = [];
  const STORAGE_KEY = "all_ears_draft_v1";

  // --------- UTIL ----------
  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  function setStatus({ on = false, text = "Mic idle", dot = false } = {}) {
    micDot.className = dot ? "dot on" : "dot";
    statusText.textContent = text;

    btnStart.disabled = on;
    btnStop.disabled = !on;

    btnInsertLive.disabled = !liveText.textContent || liveText.textContent === "—";
  }

  function countWords(str) {
    const cleaned = (str || "").trim();
    if (!cleaned) return 0;
    return cleaned.split(/\s+/).filter(Boolean).length;
  }

  function updateWordCount() {
    wordCount.textContent = String(countWords(inputText.value));
  }

  function pushUndoSnapshot() {
    const current = inputText.value;
    if (!undoStack.length || undoStack[undoStack.length - 1] !== current) {
      undoStack.push(current);
      if (undoStack.length > 25) undoStack.shift();
    }
    btnUndo.disabled = undoStack.length < 2;
  }

  function undo() {
    if (undoStack.length < 2) return;
    undoStack.pop();
    inputText.value = undoStack[undoStack.length - 1] || "";
    saveDraft();
    updateWordCount();
    btnUndo.disabled = undoStack.length < 2;
  }

  function insertAtCursor(text) {
    const ta = inputText;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;

    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);

    const spacer =
      before && !before.endsWith("\n") && !before.endsWith(" ") ? " " : "";
    const insert = spacer + text;

    ta.value = before + insert + after;
    const pos = (before + insert).length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
  }

  function normalizeFinal(text) {
    // Light cleanup: spacing + capitalize first letter
    let t = (text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    t = t.charAt(0).toUpperCase() + t.slice(1);

    // Add a period if it looks like a sentence and doesn't end with punctuation.
    if (!/[.!?]$/.test(t) && t.length > 20) t += ".";
    return t;
  }

  // --------- DRAFT SAVE/LOAD ----------
  function loadDraft() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) inputText.value = saved;
      lastSavedText = inputText.value;
      pushUndoSnapshot();
      updateWordCount();
    } catch (_) {}
  }

  function saveDraft() {
    try {
      if (inputText.value !== lastSavedText) {
        localStorage.setItem(STORAGE_KEY, inputText.value);
        lastSavedText = inputText.value;
      }
    } catch (_) {}
  }

  const saveDraftDebounced = debounce(saveDraft, 300);

  // --------- SPEECH ----------
  function supportsSpeech() {
    return !!SpeechRecognition;
  }

  function initSpeech() {
    if (!supportsSpeech()) {
      setStatus({
        on: false,
        dot: false,
        text: "Voice dictation not supported here. Use typing (Chrome/Edge recommended).",
      });
      btnStart.disabled = true;
      return;
    }

    rec = new SpeechRecognition();
    rec.lang = lang.value;
    rec.continuous = continuous.checked;
    rec.interimResults = interim.checked;

    let currentInterim = "";

    rec.onstart = () => {
      listening = true;
      setStatus({ on: true, dot: true, text: "Listening… talk naturally." });
    };

    rec.onerror = (e) => {
      // Common: "not-allowed", "no-speech", "audio-capture"
      listening = false;
      setStatus({
        on: false,
        dot: false,
        text: `Mic error: ${e.error}. Try allowing mic access or use typing.`,
      });
    };

    rec.onend = () => {
      listening = false;
      currentInterim = "";
      liveText.textContent = "—";
      setStatus({ on: false, dot: false, text: "Mic idle" });
    };

    rec.onresult = (event) => {
      let finalChunk = "";
      currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript || "";
        if (res.isFinal) finalChunk += transcript + " ";
        else currentInterim += transcript;
      }

      // Show live preview
      if (interim.checked && currentInterim.trim()) {
        liveText.textContent = currentInterim.trim();
      } else {
        liveText.textContent = "—";
      }

      btnInsertLive.disabled = liveText.textContent === "—";

      // Commit final text to textarea
      if (finalChunk.trim()) {
        const cleaned = normalizeFinal(finalChunk);
        pushUndoSnapshot();
        insertAtCursor(cleaned + " ");
        updateWordCount();
        saveDraftDebounced();
      }
    };
  }

  async function startListening() {
    if (!rec) initSpeech();
    if (!rec) return;

    // Refresh settings each time
    rec.lang = lang.value;
    rec.continuous = continuous.checked;
    rec.interimResults = interim.checked;

    try {
      // Safari/permissions: user gesture is required (button click)
      rec.start();
    } catch (e) {
      setStatus({ on: false, dot: false, text: "Could not start mic. Try again." });
    }
  }

  function stopListening() {
    try {
      rec && rec.stop();
    } catch (_) {}
  }

  // --------- BRIEF GENERATOR ----------
  function extractGoals(text) {
    const t = (text || "").toLowerCase();

    const wants = [];
    const pushIf = (needle, label) => (t.includes(needle) ? wants.push(label) : null);

    pushIf("booking", "Booking / scheduling");
    pushIf("appointment", "Appointments");
    pushIf("store", "E-commerce / store");
    pushIf("shop", "E-commerce / store");
    pushIf("payment", "Payments");
    pushIf("contact", "Contact form");
    pushIf("quote", "Quote request form");
    pushIf("gallery", "Gallery / portfolio");
    pushIf("reviews", "Reviews / testimonials");
    pushIf("blog", "Blog");
    pushIf("membership", "Member area / login");
    pushIf("dashboard", "Dashboard");
    pushIf("chat", "Chat / AI assistant");

    return [...new Set(wants)];
  }

  function suggestPages(level) {
    if (level === "starter") return ["Home", "Services", "Contact"];
    if (level === "pro") return ["Home", "Services", "About", "Pricing", "FAQs", "Contact"];
    return ["Home", "Services", "About", "Pricing", "Case Studies", "FAQs", "Contact", "Book/Apply"];
  }

  function generateBrief() {
    if (!consent.checked) {
      briefOut.textContent = "Please check the consent box first.";
      return;
    }

    const vision = inputText.value.trim();
    if (!vision) {
      briefOut.textContent = "Add some details (talk or type) so I can generate the brief.";
      return;
    }

    const tierVal = tier.value;
    const ind = (industry.value || "").trim() || "General";
    const goals = extractGoals(vision);
    const pages = suggestPages(tierVal);

    const brief = [
      `PROJECT BRIEF — ${ind}`,
      `Tier: ${tierVal.toUpperCase()}`,
      ``,
      `1) Vision (raw input)`,
      vision,
      ``,
      `2) Goals / Features`,
      goals.length ? goals.map((g) => `- ${g}`).join("\n") : "- (Not specified — will confirm in kickoff)",
      ``,
      `3) Suggested Pages`,
      pages.map((p) => `- ${p}`).join("\n"),
      ``,
      `4) Style Direction (fill during kickoff)`,
      `- Colors:`,
      `- Fonts:`,
      `- Brand vibe:`,
      ``,
      `5) Calls-To-Action`,
      `- Primary: Get Started / Book Call / Buy Plan`,
      `- Secondary: View Work / Pricing / Contact`,
      ``,
      `6) Needed From Client`,
      `- Business name + logo (or request logo)`,
      `- Services list + pricing (if public)`,
      `- Photos (or request stock images)`,
      `- Preferred domain + contact email`,
      ``,
      `Next step: confirm scope + collect deposit + schedule build kickoff.`,
    ].join("\n");

    briefOut.textContent = brief;
    btnCopyBrief.disabled = false;
    btnDownloadBrief.disabled = false;
  }

  async function copyBrief() {
    const text = briefOut.textContent || "";
    if (!text || text === "Nothing yet.") return;
    try {
      await navigator.clipboard.writeText(text);
      statusText.textContent = "Copied brief to clipboard ✅";
    } catch (_) {
      statusText.textContent = "Copy failed — select and copy manually.";
    }
  }

  function downloadBrief() {
    const text = briefOut.textContent || "";
    if (!text || text === "Nothing yet.") return;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-brief.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --------- EVENTS ----------
  btnStart.addEventListener("click", startListening);
  btnStop.addEventListener("click", stopListening);

  btnClear.addEventListener("click", () => {
    pushUndoSnapshot();
    inputText.value = "";
    liveText.textContent = "—";
    briefOut.textContent = "Nothing yet.";
    btnCopyBrief.disabled = true;
    btnDownloadBrief.disabled = true;
    saveDraft();
    updateWordCount();
    pushUndoSnapshot();
  });

  btnUndo.addEventListener("click", undo);

  btnInsertLive.addEventListener("click", () => {
    const live = (liveText.textContent || "").trim();
    if (!live || live === "—") return;
    pushUndoSnapshot();
    insertAtCursor(live + " ");
    liveText.textContent = "—";
    updateWordCount();
    saveDraftDebounced();
  });

  btnBrief.addEventListener("click", generateBrief);
  btnCopyBrief.addEventListener("click", copyBrief);
  btnDownloadBrief.addEventListener("click", downloadBrief);

  // Autosave typing
  inputText.addEventListener("input", () => {
    pushUndoSnapshot();
    updateWordCount();
    saveDraftDebounced();
  });

  // Re-init recognition on setting changes
  [lang, continuous, interim].forEach((control) => {
    control.addEventListener("change", () => {
      if (listening) stopListening();
      rec = null;
      initSpeech();
    });
  });

  // --------- BOOT ----------
  loadDraft();
  initSpeech();
  setStatus({ on: false, dot: false, text: "Mic idle" });
})();
