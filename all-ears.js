(() => {
  "use strict";

  // ---------- DOM ----------
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

  const tierSel = el("tier");
  const industry = el("industry");
  const consent = el("consent");

  const langSel = el("lang");
  const continuous = el("continuous");
  const interim = el("interim");

  const wordCount = el("wordCount");
  const micDot = el("micDot");
  const statusText = el("statusText");

  const briefOut = el("briefOut");
  const jsonOut = el("jsonOut");

  const badgeMode = el("badgeMode");
  const badgeAutosave = el("badgeAutosave");
  const badgeVersion = el("badgeVersion");

  // ---------- CONFIG ----------
  const ALL = window.ALL_EARS || {};
  const cfg = ALL.config || { app:{version:"1.0",modes:["text"],autosave:true,defaultLanguage:"en-US"}, input:{supportedLanguages:["en-US"]}, safety:{requireConsent:true} };
  const tiers = (ALL.tiers && ALL.tiers.tiers) ? ALL.tiers.tiers : {};
  const questions = (ALL.questions && ALL.questions.coreQuestions) ? ALL.questions.coreQuestions : [];

  badgeMode.textContent = `Modes: ${(cfg.app.modes || ["text"]).join(", ")}`;
  badgeAutosave.textContent = `Autosave: ${cfg.app.autosave ? "On" : "Off"}`;
  badgeVersion.textContent = `v${cfg.app.version || "1.0"}`;

  // ---------- STORAGE ----------
  const LS_KEY = "all-ears-state-v1";

  const nowISO = () => new Date().toISOString();

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeState(patch) {
    const cur = readState();
    const next = { ...cur, ...patch, updatedAt: nowISO() };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return next;
  }

  // ---------- UNDO STACK ----------
  const undoStack = [];
  const UNDO_MAX = 25;

  function pushUndo(value) {
    if (undoStack.length && undoStack[undoStack.length - 1] === value) return;
    undoStack.push(value);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    btnUndo.disabled = undoStack.length < 2; // need at least 2 to go back
  }

  function doUndo() {
    if (undoStack.length < 2) return;
    undoStack.pop(); // drop current
    const prev = undoStack[undoStack.length - 1] || "";
    inputText.value = prev;
    syncCountsAndSave();
  }

  // ---------- WORD COUNT ----------
  function countWords(s) {
    const t = (s || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function syncCountsAndSave() {
    const w = countWords(inputText.value);
    wordCount.textContent = String(w);

    // autosave
    if (cfg.app.autosave) {
      const q = collectAnswers();
      writeState({
        lang: langSel.value,
        tier: tierSel.value,
        industry: industry.value,
        consent: !!consent.checked,
        continuous: !!continuous.checked,
        interim: !!interim.checked,
        inputText: inputText.value,
        answers: q
      });
    }
  }

  // ---------- QUESTIONS ----------
  function collectAnswers() {
    const answers = {};
    document.querySelectorAll(".qInput").forEach((inp) => {
      const id = inp.getAttribute("data-qid");
      answers[id] = (inp.value || "").trim();
    });
    return answers;
  }

  function applyAnswers(answers = {}) {
    document.querySelectorAll(".qInput").forEach((inp) => {
      const id = inp.getAttribute("data-qid");
      if (answers[id] != null) inp.value = answers[id];
    });
  }

  // ---------- LOAD STATE ----------
  function restore() {
    const st = readState();
    if (st.lang) langSel.value = st.lang;
    if (st.tier) tierSel.value = st.tier;
    if (st.industry) industry.value = st.industry;
    if (typeof st.consent === "boolean") consent.checked = st.consent;
    if (typeof st.continuous === "boolean") continuous.checked = st.continuous;
    if (typeof st.interim === "boolean") interim.checked = st.interim;
    if (st.inputText) inputText.value = st.inputText;
    if (st.answers) applyAnswers(st.answers);

    pushUndo(inputText.value || "");
    syncCountsAndSave();
  }

  // ---------- SPEECH RECOGNITION ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let recognizing = false;
  let liveBuffer = "";

  function setMicUI(on, msg) {
    micDot.classList.toggle("on", !!on);
    statusText.textContent = msg || (on ? "Listening…" : "Mic idle");
    btnStart.disabled = !!on;
    btnStop.disabled = !on;
  }

  function canUseMic() {
    return !!SR && (cfg.app.modes || []).includes("voice");
  }

  function startMic() {
    if (!canUseMic()) {
      setMicUI(false, "Voice not supported in this browser.");
      return;
    }
    if (recognizing) return;

    rec = new SR();
    rec.lang = langSel.value || cfg.app.defaultLanguage || "en-US";
    rec.continuous = !!continuous.checked;
    rec.interimResults = !!interim.checked;

    liveBuffer = "";
    liveText.textContent = "Listening…";
    btnInsertLive.disabled = true;

    rec.onstart = () => {
      recognizing = true;
      setMicUI(true, "Listening…");
    };

    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = (res[0] && res[0].transcript) ? res[0].transcript : "";
        if (res.isFinal) {
          liveBuffer += (txt.trim() ? (txt.trim() + " ") : "");
        } else {
          interimText += txt;
        }
      }

      const display = (liveBuffer + interimText).trim();
      liveText.textContent = display || "—";
      btnInsertLive.disabled = !display;
    };

    rec.onerror = (e) => {
      recognizing = false;
      setMicUI(false, `Mic error: ${e.error || "unknown"}`);
    };

    rec.onend = () => {
      recognizing = false;
      setMicUI(false, "Mic idle");
      const display = (liveText.textContent || "").trim();
      btnInsertLive.disabled = !(display && display !== "—");
    };

    try {
      rec.start();
    } catch {
      recognizing = false;
      setMicUI(false, "Mic blocked. Check permissions.");
    }
  }

  function stopMic() {
    if (!rec) return;
    try { rec.stop(); } catch {}
  }

  function insertLive() {
    const t = (liveText.textContent || "").trim();
    if (!t || t === "—" || t === "Listening…") return;
    pushUndo(inputText.value);
    inputText.value = (inputText.value ? inputText.value.trim() + "\n\n" : "") + t;
    liveText.textContent = "—";
    liveBuffer = "";
    btnInsertLive.disabled = true;
    syncCountsAndSave();
  }

  // ---------- BRIEF GENERATION ----------
  function normalizeList(raw) {
    if (!raw) return [];
    // split by commas or newlines
    return raw
      .split(/[\n,]+/g)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 25);
  }

  function getTier() {
    const key = tierSel.value || "starter";
    return tiers[key] || { label: key, pages: 3, features: [], cta: "Launch" };
  }

  function requireConsentOrWarn() {
    if (!cfg.safety?.requireConsent) return true;
    if (consent.checked) return true;
    alert("Consent required: please check the consent box before generating the brief.");
    return false;
  }

  function buildBrief(data) {
    const t = data.tier;
    const featuresWanted = normalizeList(data.answers.features || "");
    const mustHave = [...new Set([...(t.features || []), ...featuresWanted])].slice(0, 30);

    const pages = [
      "Home (high-converting hero + CTA)",
      "About (trust + story)",
      "Contact (form + map/CTA)"
    ];

    if (t.pages >= 5) pages.push("Services / Offers", "Testimonials / Reviews");
    if (t.pages >= 7) pages.push("Booking / Calendar", "FAQ");
    if (t.pages >= 10) pages.push("Resources / Blog", "Policies (Privacy/Terms)", "Lead Magnet / Download");

    const vibeHints = [
      "Modern, premium, dark fintech UI",
      "Fast, mobile-first, accessible",
      "Clear CTAs, strong trust signals",
      "SEO-ready structure"
    ];

    const goal = data.answers.primary_goal || "Generate leads and convert visitors into customers.";
    const biz = data.answers.business_type || (data.industry ? `${data.industry} business` : "a service business");

    const copyBlocks = [
      `Headline: “${t.cta}: ${biz} website that converts.”`,
      `Subhead: “Turn visitors into leads with a clean UX, strong messaging, and automation.”`,
      `Primary CTA: “Get a Free Quote” / “Book a Call” / “Start Now”`,
      `Trust: badges, reviews, before/after results, process steps`
    ];

    return [
      `AI ALL EARS — BUILD-READY WEBSITE PROJECT BRIEF`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `1) Business & Goal`,
      `- Business: ${biz}`,
      `- Primary goal: ${goal}`,
      `- Industry keyword: ${data.industry || "—"}`,
      `- Tier: ${t.label} (${t.pages} pages)`,
      ``,
      `2) Must-Have Features`,
      ...(mustHave.length ? mustHave.map(x => `- ${x}`) : [`- ${t.features?.join(", ") || "Basic site + contact form"}`]),
      ``,
      `3) Suggested Pages / Sitemap`,
      ...pages.slice(0, t.pages).map((p, i) => `${i + 1}. ${p}`),
      ``,
      `4) Design & UX Direction`,
      ...vibeHints.map(v => `- ${v}`),
      ``,
      `5) Content / Copy Blocks`,
      ...copyBlocks.map(c => `- ${c}`),
      ``,
      `6) Technical Notes`,
      `- Stack: static HTML/CSS/JS (GitHub Pages ready)`,
      `- Forms: Formspree / Netlify Forms alternative (optional)`,
      `- Analytics: GA4 + Search Console (optional)`,
      `- Performance: compress images, lazy-load, minimal JS`,
      ``,
      `7) Next Actions`,
      `- Confirm brand name, logo, colors, and 3 competitors you like`,
      `- Provide offer/pricing + service area + contact info`,
      `- Approve the sitemap + must-have features list`,
      ``,
      `END OF BRIEF`
    ].join("\n");
  }

  function buildJSON(data) {
    const t = data.tier;
    const featuresWanted = normalizeList(data.answers.features || "");
    const mergedFeatures = [...new Set([...(t.features || []), ...featuresWanted])].slice(0, 50);

    return {
      meta: {
        tool: "AI All Ears",
        version: cfg.app.version || "1.0",
        generatedAt: nowISO()
      },
      inputs: {
        language: data.lang,
        tierKey: data.tierKey,
        tierLabel: t.label,
        pages: t.pages,
        industry: data.industry || "",
        consent: !!data.consent,
        voice: {
          continuous: !!data.continuous,
          livePreview: !!data.interim
        }
      },
      interview: {
        questions: questions,
        answers: data.answers
      },
      vision: data.vision,
      spec: {
        requiredFeatures: mergedFeatures,
        recommendedStack: ["HTML", "CSS", "JavaScript", "GitHub Pages"],
        deliverables: [
          "High-converting homepage",
          "Sitemap / page list",
          "Content blocks + CTA plan",
          "Basic SEO checklist"
        ]
      }
    };
  }

  function generate() {
    if (!requireConsentOrWarn()) return;

    const tierKey = tierSel.value || "starter";
    const data = {
      lang: langSel.value || cfg.app.defaultLanguage || "en-US",
      tierKey,
      tier: getTier(),
      industry: (industry.value || "").trim(),
      consent: !!consent.checked,
      continuous: !!continuous.checked,
      interim: !!interim.checked,
      vision: (inputText.value || "").trim(),
      answers: collectAnswers()
    };

    // if empty, force user to give *something*
    if (!data.vision && Object.values(data.answers).every(v => !v)) {
      alert("Type something in 'Your Vision' or answer at least one interview question.");
      return;
    }

    const brief = buildBrief(data);
    const json = buildJSON(data);

    briefOut.textContent = brief;
    jsonOut.textContent = JSON.stringify(json, null, 2);

    btnCopyBrief.disabled = false;
    btnDownloadBrief.disabled = false;

    writeState({ lastBrief: brief, lastJSON: json });
  }

  // ---------- COPY / DOWNLOAD ----------
  async function copyBrief() {
    const txt = briefOut.textContent || "";
    if (!txt || txt === "Nothing yet.") return;
    try {
      await navigator.clipboard.writeText(txt);
      btnCopyBrief.textContent = "✅ Copied";
      setTimeout(() => (btnCopyBrief.textContent = "📋 Copy Brief"), 1200);
    } catch {
      alert("Copy failed. Try selecting the text and copying manually.");
    }
  }

  function downloadBrief() {
    const txt = briefOut.textContent || "";
    if (!txt || txt === "Nothing yet.") return;

    const name = `ai-all-ears-brief-${new Date().toISOString().slice(0,10)}.txt`;
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- EVENTS ----------
  btnStart.addEventListener("click", startMic);
  btnStop.addEventListener("click", stopMic);
  btnInsertLive.addEventListener("click", insertLive);

  btnUndo.addEventListener("click", doUndo);

  btnClear.addEventListener("click", () => {
    pushUndo(inputText.value);
    inputText.value = "";
    liveText.textContent = "—";
    liveBuffer = "";
    btnInsertLive.disabled = true;
    syncCountsAndSave();
  });

  btnBrief.addEventListener("click", generate);
  btnCopyBrief.addEventListener("click", copyBrief);
  btnDownloadBrief.addEventListener("click", downloadBrief);

  // input changes
  inputText.addEventListener("input", () => {
    pushUndo(inputText.value);
    btnUndo.disabled = undoStack.length < 2;
    syncCountsAndSave();
  });

  industry.addEventListener("input", syncCountsAndSave);
  langSel.addEventListener("change", syncCountsAndSave);
  tierSel.addEventListener("change", syncCountsAndSave);
  consent.addEventListener("change", syncCountsAndSave);
  continuous.addEventListener("change", syncCountsAndSave);
  interim.addEventListener("change", syncCountsAndSave);

  document.addEventListener("input", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("qInput")) {
      syncCountsAndSave();
    }
  });

  // ---------- INIT ----------
  // If browser doesn't support mic, remove the tease
  if (!SR) {
    badgeMode.textContent = "Modes: text";
  }

  restore();
})();
