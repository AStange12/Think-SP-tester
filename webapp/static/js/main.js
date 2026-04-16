/**
 * Reddit-to-Think Web App — Frontend Logic
 */

// --- State ---
const state = {
    thinkJson:      null,
    markdown:       null,       // SP A markdown
    annotatedJson:  null,       // SP A annotated
    markdownB:      null,       // SP B markdown (compare)
    annotatedJsonB: null,       // SP B annotated (compare)
    thinkId:        null,
    parsedUrl:      null,       // last URL successfully fetched+parsed
    inputMode:      "url",      // "url" | "paste"
    compareMode:    false,
};

// active suite: { filename, name, type, items }
// kept separate so we can update it without re-rendering everything
let activeSuite = null;

// --- DOM refs ---
const urlInput           = document.getElementById("url-input");
const promptTextarea     = document.getElementById("prompt-textarea");
const promptTextareaB    = document.getElementById("prompt-textarea-b");
const modeSelect         = document.getElementById("mode-select");
const commentSelectGroup = document.getElementById("comment-select-group");
const commentModeSelect  = document.getElementById("comment-mode");
const rangeInputs        = document.getElementById("range-inputs");
const randomInputs       = document.getElementById("random-inputs");
const rangeStart         = document.getElementById("range-start");
const rangeEnd           = document.getElementById("range-end");
const randomCount        = document.getElementById("random-count");
const commentWarning     = document.getElementById("comment-warning");
const runBtn             = document.getElementById("run-btn");
const runBtnText         = document.getElementById("run-btn-text");
const runHint            = document.getElementById("run-hint");
const addToSuiteBtn      = document.getElementById("add-to-suite-btn");
const downloadJsonBtn    = document.getElementById("download-json-btn");
const statusBadge        = document.getElementById("status-badge");
const outputArea         = document.getElementById("output-area");
const downloadRow        = document.getElementById("download-row");
const downloadBtn        = document.getElementById("download-btn");
const downloadBtnText    = document.getElementById("download-btn-text");
const downloadBtnB       = document.getElementById("download-btn-b");
const tabUrlBtn          = document.getElementById("tab-url");
const tabPasteBtn        = document.getElementById("tab-paste");
const urlModeDiv         = document.getElementById("url-mode");
const pasteModeDiv       = document.getElementById("paste-mode");
const pasteTextarea      = document.getElementById("paste-textarea");
const pasteAuthor        = document.getElementById("paste-author");
const pasteSource        = document.getElementById("paste-source");
const saveCommentBtn     = document.getElementById("save-comment-btn");
const suiteSelect        = document.getElementById("suite-select");
const newSuiteBtn        = document.getElementById("new-suite-btn");
const deleteSuiteBtn     = document.getElementById("delete-suite-btn");
const suiteInfo          = document.getElementById("suite-info");
const compareToggle      = document.getElementById("compare-toggle");
const compareSp          = document.getElementById("compare-sp");
const spLabel            = document.getElementById("sp-label");
const importSuiteBtn     = document.getElementById("import-suite-btn");
const importSuiteInput   = document.getElementById("import-suite-input");
const modalOverlay       = document.getElementById("modal-overlay");

// --- Init ---
updateCommentSelectVisibility();
updateCommentWarning();
loadSuitesList();

// --- Event listeners ---
runBtn.addEventListener("click", handleRun);
tabUrlBtn.addEventListener("click",   () => setInputMode("url"));
tabPasteBtn.addEventListener("click", () => setInputMode("paste"));
modeSelect.addEventListener("change", handleModeChange);
commentModeSelect.addEventListener("change", handleCommentModeChange);
rangeStart.addEventListener("input",  updateCommentWarning);
rangeEnd.addEventListener("input",    updateCommentWarning);
randomCount.addEventListener("input", updateCommentWarning);
compareToggle.addEventListener("click", handleCompareToggle);
suiteSelect.addEventListener("change", handleSuiteChange);
newSuiteBtn.addEventListener("click",    handleNewSuiteClick);
deleteSuiteBtn.addEventListener("click", handleDeleteSuite);
addToSuiteBtn.addEventListener("click",  handleAddThreadToSuite);
saveCommentBtn.addEventListener("click", handleSavePastedComment);
downloadBtn.addEventListener("click",   () => handleDownloadMd("A"));
downloadBtnB.addEventListener("click",  () => handleDownloadMd("B"));
downloadJsonBtn.addEventListener("click", handleDownloadJson);
importSuiteBtn.addEventListener("click", () => importSuiteInput.click());
importSuiteInput.addEventListener("change", handleImportSuite);
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") handleRun();
    if (e.key === "Escape") closeAllModals();
});

// ---------------------------------------------------------------------------
// Input mode toggle
// ---------------------------------------------------------------------------

function setInputMode(mode) {
    state.inputMode = mode;
    tabUrlBtn.classList.toggle("tab-btn--active",   mode === "url");
    tabPasteBtn.classList.toggle("tab-btn--active", mode === "paste");
    urlModeDiv.classList.toggle("hidden",   mode !== "url");
    pasteModeDiv.classList.toggle("hidden", mode !== "paste");
    // Save Thread button only makes sense in URL mode after a thread is loaded
    if (mode === "paste") addToSuiteBtn.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Compare toggle
// ---------------------------------------------------------------------------

function handleCompareToggle() {
    state.compareMode = !state.compareMode;
    compareToggle.classList.toggle("tab-btn--active", state.compareMode);
    compareSp.classList.toggle("hidden", !state.compareMode);
    spLabel.textContent = state.compareMode ? "System Prompt A" : "System Prompt";
}

// ---------------------------------------------------------------------------
// ── Modal system ────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

function openModal(id) {
    modalOverlay.classList.remove("hidden");
    document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
    const anyOpen = modalOverlay.querySelectorAll(".modal:not(.hidden)").length > 0;
    if (!anyOpen) modalOverlay.classList.add("hidden");
}

function closeAllModals() {
    modalOverlay.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
    modalOverlay.classList.add("hidden");
}

// Close on overlay click
modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) closeAllModals();
});

// data-close-modal attribute wires close buttons generically
document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});

// ── New suite modal ─────────────────────────────────────────────

let _newSuiteType     = "comments";
let _newSuiteCallback = null; // called with { filename, suite } after creation

function showNewSuiteModal({ defaultType = "comments", onCreated } = {}) {
    _newSuiteType     = defaultType;
    _newSuiteCallback = onCreated || null;

    document.getElementById("modal-suite-name").value = "";
    document.getElementById("modal-new-suite-error").classList.add("hidden");
    _setTypeToggle(defaultType);
    openModal("modal-new-suite");
    setTimeout(() => document.getElementById("modal-suite-name").focus(), 50);
}

function _setTypeToggle(type) {
    document.getElementById("modal-type-comments").classList.toggle("type-btn--active", type === "comments");
    document.getElementById("modal-type-threads").classList.toggle("type-btn--active",  type === "threads");
    _newSuiteType = type;
}

document.getElementById("modal-type-comments").addEventListener("click", () => _setTypeToggle("comments"));
document.getElementById("modal-type-threads").addEventListener("click",  () => _setTypeToggle("threads"));
document.getElementById("modal-suite-cancel").addEventListener("click",  () => closeModal("modal-new-suite"));
document.getElementById("modal-suite-create").addEventListener("click",  submitNewSuite);
document.getElementById("modal-suite-name").addEventListener("keydown", e => {
    if (e.key === "Enter") submitNewSuite();
});

async function submitNewSuite() {
    const name = document.getElementById("modal-suite-name").value.trim();
    const errEl = document.getElementById("modal-new-suite-error");
    if (!name) { document.getElementById("modal-suite-name").focus(); return; }

    errEl.classList.add("hidden");
    try {
        const resp = await fetch("/api/suites", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ name, type: _newSuiteType }),
        });
        const data = await resp.json();
        if (!resp.ok) {
            errEl.textContent = data.error || "Failed to create suite";
            errEl.classList.remove("hidden");
            return;
        }
        closeModal("modal-new-suite");
        await loadSuitesList();
        if (_newSuiteCallback) _newSuiteCallback(data);
    } catch (e) {
        errEl.textContent = "Network error";
        errEl.classList.remove("hidden");
    }
}

// ── Confirm modal ───────────────────────────────────────────────

let _confirmCallback = null;

function showConfirmModal({ title, message, confirmText = "Confirm", onConfirm } = {}) {
    _confirmCallback = onConfirm || null;
    document.getElementById("modal-confirm-title").textContent   = title || "Confirm";
    document.getElementById("modal-confirm-message").textContent = message || "";
    document.getElementById("modal-confirm-ok").textContent      = confirmText;
    openModal("modal-confirm");
}

document.getElementById("modal-confirm-cancel").addEventListener("click", () => closeModal("modal-confirm"));
document.getElementById("modal-confirm-ok").addEventListener("click", () => {
    closeModal("modal-confirm");
    if (_confirmCallback) _confirmCallback();
});

// ── Suite picker modal (file-explorer style) ────────────────────

let _pickerFilter    = null;  // "comments" | "threads" | null
let _pickerItemData  = null;  // the item to save
let _pickerCallback  = null;  // called on successful save
let _pickerSelected  = null;  // currently selected suite filename

async function showSuitePickerModal({ filter, itemData, title = "Save to Suite", onSaved } = {}) {
    _pickerFilter   = filter || null;
    _pickerItemData = itemData;
    _pickerCallback = onSaved || null;
    _pickerSelected = null;

    document.getElementById("modal-picker-title").textContent = title;
    document.getElementById("picker-save-btn").disabled       = true;

    await _renderPickerSuites();
    openModal("modal-suite-picker");
}

async function _renderPickerSuites() {
    const list = document.getElementById("picker-suite-list");
    list.innerHTML = '<div class="picker-global-msg">Loading...</div>';

    try {
        const resp   = await fetch("/api/suites");
        const data   = await resp.json();
        const suites = (data.suites || []).filter(s => !_pickerFilter || s.type === _pickerFilter);

        list.innerHTML = "";

        // Remove any previous error banners
        list.querySelectorAll(".picker-error-banner").forEach(el => el.remove());

        if (suites.length === 0) {
            const msg = document.createElement("div");
            msg.className   = "picker-global-msg";
            msg.textContent = _pickerFilter
                ? `No ${_pickerFilter} suites yet — create one below.`
                : "No suites yet — create one below.";
            list.appendChild(msg);
            return;
        }

        suites.forEach(suite => list.appendChild(_buildPickerFolder(suite)));
    } catch (e) {
        list.innerHTML = '<div class="picker-global-msg" style="color:var(--error-text)">Failed to load suites</div>';
    }
}

function _buildPickerFolder(suite) {
    const folder = document.createElement("div");
    folder.className = "picker-suite-folder";

    const header = document.createElement("div");
    header.className = "picker-folder-header";

    const icon     = Object.assign(document.createElement("span"), { className: "picker-folder-icon",  textContent: "📁" });
    const name     = Object.assign(document.createElement("span"), { className: "picker-folder-name",  textContent: suite.name });
    const meta     = Object.assign(document.createElement("span"), { className: "picker-folder-meta",  textContent: `${suite.type} · ${suite.count}` });
    const chevron  = Object.assign(document.createElement("span"), { className: "picker-folder-chevron", textContent: "▶" });

    header.append(icon, name, meta, chevron);

    const itemsDiv = document.createElement("div");
    itemsDiv.className = "picker-folder-items";
    itemsDiv._loaded   = false;

    header.addEventListener("click", async () => {
        const wasOpen = itemsDiv.classList.contains("open");

        // Collapse all first
        document.querySelectorAll(".picker-folder-header.selected").forEach(h => h.classList.remove("selected"));
        document.querySelectorAll(".picker-folder-chevron.open").forEach(c => c.classList.remove("open"));
        document.querySelectorAll(".picker-folder-items.open").forEach(d => d.classList.remove("open"));
        _pickerSelected = null;
        document.getElementById("picker-save-btn").disabled = true;

        if (!wasOpen) {
            header.classList.add("selected");
            chevron.classList.add("open");
            itemsDiv.classList.add("open");
            _pickerSelected = suite.filename;
            document.getElementById("picker-save-btn").disabled = false;

            if (!itemsDiv._loaded) {
                itemsDiv._loaded = true;
                itemsDiv.innerHTML = '<div class="picker-empty-msg">Loading...</div>';
                try {
                    const resp  = await fetch(`/api/suites/${encodeURIComponent(suite.filename)}`);
                    const sData = await resp.json();
                    const items = (sData.suite || {}).items || [];
                    itemsDiv.innerHTML = "";
                    if (items.length === 0) {
                        itemsDiv.appendChild(Object.assign(document.createElement("div"), {
                            className: "picker-empty-msg", textContent: "Empty suite",
                        }));
                    } else {
                        items.forEach(item => {
                            const row = document.createElement("div");
                            row.className   = "picker-item-row";
                            row.textContent = suite.type === "comments"
                                ? `• ${item.author || "?"}: "${(item.text || "").slice(0, 55)}${(item.text || "").length > 55 ? "…" : ""}"`
                                : `• ${item.name || item.id}`;
                            itemsDiv.appendChild(row);
                        });
                    }
                } catch (e) {
                    itemsDiv.innerHTML = '<div class="picker-empty-msg" style="color:var(--error-text)">Failed to load</div>';
                }
            }
        }
    });

    folder.append(header, itemsDiv);
    return folder;
}

document.getElementById("picker-cancel-btn").addEventListener("click", () => closeModal("modal-suite-picker"));

document.getElementById("picker-new-suite-btn").addEventListener("click", () => {
    // Remember context, re-open picker after suite created
    const savedFilter   = _pickerFilter;
    const savedItemData = _pickerItemData;
    const savedCallback = _pickerCallback;
    closeModal("modal-suite-picker");
    showNewSuiteModal({
        defaultType: savedFilter || "comments",
        onCreated: async () => {
            await showSuitePickerModal({
                filter:   savedFilter,
                itemData: savedItemData,
                onSaved:  savedCallback,
            });
        },
    });
});

document.getElementById("picker-save-btn").addEventListener("click", async () => {
    if (!_pickerSelected || !_pickerItemData) return;

    const saveBtn     = document.getElementById("picker-save-btn");
    saveBtn.disabled  = true;
    saveBtn.textContent = "Saving…";

    try {
        const resp = await fetch(`/api/suites/${encodeURIComponent(_pickerSelected)}/items`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ item: _pickerItemData }),
        });
        const data = await resp.json();

        if (!resp.ok) {
            _showPickerError(data.error === "duplicate"
                ? (data.message || "This item already exists in this suite.")
                : (data.error || "Failed to save"));
            saveBtn.disabled    = false;
            saveBtn.textContent = "Save";
            return;
        }

        closeModal("modal-suite-picker");
        await loadSuitesList();

        // If the target is the currently displayed suite, update it in memory
        if (activeSuite && activeSuite.filename === _pickerSelected) {
            activeSuite.items.push({ id: data.item_id, ..._pickerItemData });
            updateSuiteInfo();
            renderSuiteItems();
        }

        if (_pickerCallback) _pickerCallback(data);
    } catch (e) {
        _showPickerError("Network error");
        saveBtn.disabled    = false;
        saveBtn.textContent = "Save";
    }
});

function _showPickerError(msg) {
    const list    = document.getElementById("picker-suite-list");
    const existing = list.querySelector(".picker-error-banner");
    if (existing) existing.remove();
    const err       = document.createElement("div");
    err.className   = "picker-error-banner";
    err.textContent = msg;
    list.prepend(err);
}

// ---------------------------------------------------------------------------
// Main run flow
// ---------------------------------------------------------------------------

async function handleRun() {
    const systemPrompt = promptTextarea.value.trim();
    if (!systemPrompt) { promptTextarea.focus(); return; }
    if (state.compareMode && !promptTextareaB.value.trim()) {
        promptTextareaB.focus(); return;
    }

    runHint.classList.add("hidden");
    state.markdown      = null;
    state.annotatedJson = null;
    state.markdownB     = null;
    state.annotatedJsonB = null;
    outputArea.innerHTML = "";
    downloadRow.classList.add("hidden");
    downloadBtnB.classList.add("hidden");
    downloadBtnText.textContent = "Download .md";
    downloadJsonBtn.classList.add("hidden");
    runBtn.disabled = true;

    // If a suite with items is selected → run the suite
    if (activeSuite && activeSuite.items.length > 0) {
        await handleRunSuite();
        runBtn.disabled = false;
        return;
    }

    // Step 1: Get think_json
    if (state.inputMode === "paste") {
        const text = pasteTextarea.value.trim();
        if (!text) {
            showRunHint("Paste a comment above first");
            runBtn.disabled = false;
            return;
        }
        const now    = new Date().toISOString().replace(/\.\d+Z$/, "Z");
        const itemId = "manual_" + Date.now();
        state.thinkJson = {
            think_id:    itemId,
            proposition: pasteSource.value.trim() || "[Manual Input]",
            created_at:  now,
            responses: [{
                response_id:          itemId,
                author:               pasteAuthor.value.trim() || "Unknown",
                text,
                created_at:           now,
                influences:           0,
                is_think_manager:     false,
                exceeds_think_format: false,
                replies:              [],
            }],
            metadata: {
                source: "manual", source_url: "", subreddit: "",
                total_comments: 1, op_author: "",
                proposition_details: "", responses_included: 1,
            },
        };
        state.thinkId   = itemId;
        state.parsedUrl = null;
        setStatus("parsing", "Ready");
        showParseSummary("Manual input: 1 comment");

    } else {
        // URL mode
        const url          = urlInput.value.trim();
        const urlUnchanged = url && url === state.parsedUrl && state.thinkJson !== null;
        const useLoaded    = !url && state.thinkJson !== null;
        const skipParse    = urlUnchanged || useLoaded;

        if (!skipParse && !url) {
            showRunHint("Paste a Reddit URL above first");
            runBtn.disabled = false;
            return;
        }

        if (!skipParse) {
            state.thinkJson = null;
            state.thinkId   = null;
            addToSuiteBtn.classList.add("hidden");
        }

        if (skipParse) {
            const label = urlUnchanged ? "Using cached parse" : "Using loaded thread";
            setStatus("parsing", "Cached");
            showParseSummary(`${label}: ${state.thinkId} — skipping fetch`);
            addToSuiteBtn.classList.remove("hidden");
        } else {
            setStatus("fetching", "Fetching...");
            let parseResult;
            try {
                const resp = await fetch("/api/parse", {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ url }),
                });
                parseResult = await resp.json();
                if (!resp.ok) {
                    showError(parseResult.stage || "fetch", parseResult.error || "Unknown error");
                    setStatus("error", "Error");
                    runBtn.disabled = false;
                    return;
                }
            } catch (e) {
                showError("fetch", `Network error: ${e.message}`);
                setStatus("error", "Error");
                runBtn.disabled = false;
                return;
            }
            state.thinkJson  = parseResult.think_json;
            state.thinkId    = parseResult.think_json.think_id || "output";
            state.parsedUrl  = url;
            setStatus("parsing", "Parsed");
            showParseSummary(parseResult.summary);
            addToSuiteBtn.classList.remove("hidden");
        }
    }

    // Step 2: Evaluate
    const modeMap     = { banjo_coach: "coach", summary: "summary" };
    const backendMode = modeMap[modeSelect.value] || "coach";
    const selInfo     = buildCommentSelection(backendMode);

    let evalStatusMsg = "Evaluating...";
    if (backendMode === "coach") {
        if (selInfo.type === "random")     evalStatusMsg = `Evaluating ${selInfo.count} comments...`;
        else if (selInfo.type === "range") evalStatusMsg = `Evaluating comments ${selInfo.start}–${selInfo.end}...`;
        else                               evalStatusMsg = "Evaluating all comments...";
    }
    setStatus("evaluating", evalStatusMsg);

    if (state.compareMode) {
        await runCompare(backendMode, selInfo);
    } else {
        await runSingle(backendMode, selInfo, systemPrompt);
    }

    runBtn.disabled = false;
}

async function runSingle(backendMode, selInfo, systemPrompt) {
    let evalResult;
    try {
        const resp = await fetch("/api/evaluate", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
                think_json:        state.thinkJson,
                system_prompt:     systemPrompt,
                mode:              backendMode,
                comment_selection: selInfo,
            }),
        });
        evalResult = await resp.json();
        if (!resp.ok) {
            showError(evalResult.stage || "evaluate", evalResult.error || "Unknown error");
            setStatus("error", "Error");
            return;
        }
    } catch (e) {
        showError("evaluate", `Network error: ${e.message}`);
        setStatus("error", "Error");
        return;
    }

    state.markdown      = evalResult.markdown;
    state.annotatedJson = evalResult.annotated_json || null;

    if (backendMode === "coach" && state.annotatedJson) {
        renderCommentCards(state.annotatedJson, outputArea);
    } else {
        showMarkdown(evalResult.markdown);
    }

    setStatus("complete", "Complete");
    downloadRow.classList.remove("hidden");
    if (state.annotatedJson) downloadJsonBtn.classList.remove("hidden");
}

async function runCompare(backendMode, selInfo) {
    const spA = promptTextarea.value.trim();
    const spB = promptTextareaB.value.trim();

    // Resolve random selection so both SPs see the exact same comments
    let resolvedSel = selInfo;
    if (selInfo.type === "random") {
        try {
            const r = await fetch("/api/resolve-selection", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ think_json: state.thinkJson, comment_selection: selInfo }),
            });
            if (r.ok) {
                const d = await r.json();
                if (d.ids && d.ids.length > 0) resolvedSel = { type: "ids", ids: d.ids };
            }
        } catch (_) { /* fallback to original selInfo */ }
    }

    const buildPayload = (sp) => JSON.stringify({
        think_json:        state.thinkJson,
        system_prompt:     sp,
        mode:              backendMode,
        comment_selection: resolvedSel,
    });

    let respA, respB;
    try {
        [respA, respB] = await Promise.all([
            fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: buildPayload(spA) }),
            fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: buildPayload(spB) }),
        ]);
    } catch (e) {
        showError("evaluate", `Network error: ${e.message}`);
        setStatus("error", "Error");
        return;
    }

    const [resultA, resultB] = await Promise.all([respA.json(), respB.json()]);

    const cols = document.createElement("div");
    cols.className = "compare-cols";

    ["A", "B"].forEach((label, i) => {
        const resp   = i === 0 ? respA   : respB;
        const result = i === 0 ? resultA : resultB;

        const col = document.createElement("div");
        col.className = "compare-col";

        const colLabel = document.createElement("div");
        colLabel.className   = "compare-col-label";
        colLabel.textContent = `SP ${label}`;
        col.appendChild(colLabel);

        if (!resp.ok) {
            col.appendChild(buildErrorEl(result.stage || "evaluate", result.error || "Unknown error"));
        } else if (backendMode === "coach" && result.annotated_json) {
            renderCommentCards(result.annotated_json, col);
        } else {
            const div = document.createElement("div");
            div.className = "markdown-output";
            div.innerHTML = renderMarkdown(result.markdown || "");
            col.appendChild(div);
        }
        cols.appendChild(col);
    });

    outputArea.appendChild(cols);

    // Store both for download
    state.markdown       = resultA.markdown       || null;
    state.annotatedJson  = resultA.annotated_json || null;
    state.markdownB      = resultB.markdown       || null;
    state.annotatedJsonB = resultB.annotated_json || null;

    setStatus("complete", "Complete");
    downloadRow.classList.remove("hidden");

    // Show two download buttons with SP labels
    downloadBtnText.textContent = "SP A .md";
    downloadBtnB.classList.remove("hidden");

    if (state.annotatedJson) downloadJsonBtn.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Comment card rendering (coach mode output)
// ---------------------------------------------------------------------------

function renderCommentCards(annotatedJson, container) {
    const nodes     = collectAllNodes(annotatedJson.responses || []);
    const evaluated = nodes.filter(n => n.moderation_feedback);

    if (evaluated.length === 0) {
        const div = document.createElement("div");
        div.className = "markdown-output";
        div.innerHTML = "<p>No comments evaluated.</p>";
        container.appendChild(div);
        return;
    }

    evaluated.forEach(node => {
        const id       = node.response_id || node.reply_id || "?";
        const author   = node.author || "Unknown";
        const text     = node.text || "";
        const feedback = node.moderation_feedback || "";

        const card = document.createElement("div");
        card.className = "comment-card";

        // Header
        const header = document.createElement("div");
        header.className = "comment-card-header";
        const authorEl = Object.assign(document.createElement("span"), { className: "comment-card-author", textContent: author });
        const idEl     = Object.assign(document.createElement("span"), { className: "comment-card-id",     textContent: "#" + id });
        header.append(authorEl, idEl);

        // Text (with expand if long)
        const TRUNCATE  = 250;
        const truncated = text.length > TRUNCATE;
        const textDiv   = document.createElement("div");
        textDiv.className = "comment-card-text";
        const contentSpan = document.createElement("span");
        contentSpan.className   = "comment-text-content";
        contentSpan.textContent = truncated ? text.slice(0, TRUNCATE) + "…" : text;
        textDiv.appendChild(contentSpan);
        if (truncated) {
            const expandBtn = document.createElement("button");
            expandBtn.className   = "expand-btn";
            expandBtn.textContent = "Show full ▼";
            let expanded = false;
            expandBtn.addEventListener("click", () => {
                expanded = !expanded;
                contentSpan.textContent = expanded ? text : text.slice(0, TRUNCATE) + "…";
                expandBtn.textContent   = expanded ? "Collapse ▲" : "Show full ▼";
            });
            textDiv.appendChild(expandBtn);
        }

        // Feedback
        const feedbackDiv   = document.createElement("div");
        feedbackDiv.className = "comment-card-feedback";
        const feedbackLabel  = Object.assign(document.createElement("span"), { className: "feedback-label", textContent: "Feedback" });
        const feedbackText   = Object.assign(document.createElement("div"),  { className: "feedback-text",  textContent: feedback });
        feedbackDiv.append(feedbackLabel, feedbackText);

        // Actions
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "comment-card-actions";
        const addBtn = document.createElement("button");
        addBtn.className   = "btn-secondary btn-sm";
        addBtn.textContent = "+ Add to Suite";
        addBtn.addEventListener("click", () => {
            handleAddCommentToSuite({ text, author, source: annotatedJson.proposition || "" }, addBtn);
        });
        actionsDiv.appendChild(addBtn);

        card.append(header, textDiv, feedbackDiv, actionsDiv);
        container.appendChild(card);
    });
}

function collectAllNodes(responses) {
    const nodes = [];
    function walk(items) {
        for (const item of items) {
            nodes.push(item);
            if (item.replies && item.replies.length) walk(item.replies);
        }
    }
    walk(responses);
    return nodes;
}

// ---------------------------------------------------------------------------
// Suite management
// ---------------------------------------------------------------------------

async function loadSuitesList() {
    try {
        const resp   = await fetch("/api/suites");
        const data   = await resp.json();
        const suites = data.suites || [];

        suiteSelect.innerHTML = "";
        const placeholder       = document.createElement("option");
        placeholder.value       = "";
        placeholder.selected    = !activeSuite;
        placeholder.textContent = suites.length === 0 ? "— no suites —" : "— none —";
        suiteSelect.appendChild(placeholder);

        suites.forEach(s => {
            const opt       = document.createElement("option");
            opt.value       = s.filename;
            opt.textContent = `${s.name} (${s.type}, ${s.count})`;
            opt.selected    = activeSuite && activeSuite.filename === s.filename;
            suiteSelect.appendChild(opt);
        });

        deleteSuiteBtn.disabled = !activeSuite;
    } catch (e) {
        console.warn("Could not load suites:", e);
    }
}

async function handleSuiteChange() {
    const filename = suiteSelect.value;
    if (!filename) {
        activeSuite = null;
        updateSuiteInfo();
        renderSuiteItems();
        deleteSuiteBtn.disabled = true;
        return;
    }
    deleteSuiteBtn.disabled = false;

    try {
        const resp = await fetch(`/api/suites/${encodeURIComponent(filename)}`);
        const data = await resp.json();
        activeSuite = { filename, ...data.suite };
        updateSuiteInfo();
        renderSuiteItems();
        updateRunBtn();
    } catch (e) {
        console.warn("Could not load suite:", e);
    }
}

function updateSuiteInfo() {
    if (!activeSuite) {
        suiteInfo.classList.add("hidden");
        updateRunBtn();
        return;
    }
    suiteInfo.textContent = `${activeSuite.items.length} ${activeSuite.type} · "${activeSuite.name}"`;
    suiteInfo.classList.remove("hidden");
    updateRunBtn();
}

function updateRunBtn() {
    const hasSuiteItems = activeSuite && activeSuite.items && activeSuite.items.length > 0;
    runBtnText.textContent = hasSuiteItems ? "Run Suite" : "Run";
}

function renderSuiteItems() {
    const container = document.getElementById("suite-items");
    container.innerHTML = "";

    if (!activeSuite || activeSuite.items.length === 0) {
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");
    activeSuite.items.forEach(item => {
        const row = document.createElement("div");
        row.className = "suite-item-row";

        const label = document.createElement("span");
        label.className = "suite-item-label";
        if (activeSuite.type === "comments") {
            const preview = (item.text || "").slice(0, 60);
            label.textContent = `${item.author || "Unknown"}: "${preview}${preview.length < (item.text || "").length ? "…" : ""}"`;
        } else {
            label.textContent = item.name || item.id;
        }

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-secondary btn-sm btn-icon-only";
        removeBtn.title     = "Remove from suite";
        removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        removeBtn.addEventListener("click", () => handleRemoveSuiteItem(item.id, removeBtn));

        row.append(label, removeBtn);
        container.appendChild(row);
    });
}

function handleNewSuiteClick() {
    showNewSuiteModal({
        onCreated: async (created) => {
            // Select the new suite in the dropdown
            suiteSelect.value = created.filename;
            activeSuite = { filename: created.filename, ...created.suite };
            deleteSuiteBtn.disabled = false;
            updateSuiteInfo();
            renderSuiteItems();
        },
    });
}

async function handleDeleteSuite() {
    if (!activeSuite) return;
    showConfirmModal({
        title:       "Delete Suite",
        message:     `Delete "${activeSuite.name}"? This cannot be undone.`,
        confirmText: "Delete",
        onConfirm:   async () => {
            try {
                const resp = await fetch(`/api/suites/${encodeURIComponent(activeSuite.filename)}`, { method: "DELETE" });
                if (!resp.ok) { const d = await resp.json(); alert(`Delete failed: ${d.error}`); return; }
                activeSuite = null;
                await loadSuitesList();
                updateSuiteInfo();
                renderSuiteItems();
            } catch (e) {
                alert(`Network error: ${e.message}`);
            }
        },
    });
}

async function handleRemoveSuiteItem(itemId, btn) {
    if (!activeSuite) return;
    btn.disabled = true;
    try {
        const resp = await fetch(`/api/suites/${encodeURIComponent(activeSuite.filename)}/items/${itemId}`, { method: "DELETE" });
        if (!resp.ok) { btn.disabled = false; return; }
        activeSuite.items = activeSuite.items.filter(i => i.id !== itemId);
        updateSuiteInfo();
        renderSuiteItems();
        await loadSuitesList();
    } catch (e) {
        btn.disabled = false;
    }
}

// Add current thread to a threads suite (opens picker)
function handleAddThreadToSuite() {
    if (!state.thinkJson || !state.thinkId) return;
    const itemData = {
        name:       (state.thinkJson.proposition || state.thinkId).slice(0, 80),
        think_json: state.thinkJson,
    };
    showSuitePickerModal({
        filter:   "threads",
        itemData,
        title:    "Add Thread to Suite",
        onSaved:  () => showInlineMsg(addToSuiteBtn, "Added", "success"),
    });
}

// Add a comment from a coach output card (opens picker)
function handleAddCommentToSuite(commentData, btn) {
    showSuitePickerModal({
        filter:   "comments",
        itemData: commentData,
        title:    "Add Comment to Suite",
        onSaved:  () => {
            btn.textContent = "Added ✓";
            btn.disabled    = true;
        },
    });
}

// Save pasted comment to a suite (opens picker)
function handleSavePastedComment() {
    const text = pasteTextarea.value.trim();
    if (!text) { pasteTextarea.focus(); return; }
    const itemData = {
        text,
        author: pasteAuthor.value.trim() || "Unknown",
        source: pasteSource.value.trim() || "",
    };
    showSuitePickerModal({
        filter:   "comments",
        itemData,
        title:    "Save Comment to Suite",
        onSaved:  () => showInlineMsg(saveCommentBtn, "Saved", "success"),
    });
}

// ---------------------------------------------------------------------------
// Suite run (triggered via Run button when a suite is selected)
// ---------------------------------------------------------------------------

async function handleRunSuite() {
    if (!activeSuite || activeSuite.items.length === 0) return;

    const systemPrompt = promptTextarea.value.trim();
    if (!systemPrompt) { promptTextarea.focus(); return; }

    const modeMap     = { banjo_coach: "coach", summary: "summary" };
    const backendMode = modeMap[modeSelect.value] || "coach";
    const selInfo     = buildCommentSelection(backendMode);

    // Apply item selection to suite items client-side
    const selectedItems = selectSuiteItems(activeSuite.items, selInfo);
    const itemIds       = selectedItems.map(i => i.id);

    outputArea.innerHTML = "";
    downloadRow.classList.add("hidden");
    downloadBtnB.classList.add("hidden");
    downloadBtnText.textContent = "Download .md";
    downloadJsonBtn.classList.add("hidden");
    state.thinkId = activeSuite.filename.replace(".json", "");

    const buildPayload = (sp) => JSON.stringify({
        system_prompt:     sp,
        mode:              backendMode,
        item_ids:          itemIds,
        comment_selection: selInfo,
    });

    if (state.compareMode) {
        const spA = promptTextarea.value.trim();
        const spB = promptTextareaB.value.trim();
        if (!spB) { promptTextareaB.focus(); return; }

        setStatus("evaluating", `Comparing suite (${selectedItems.length} items)...`);
        try {
            const url = `/api/suites/${encodeURIComponent(activeSuite.filename)}/run`;
            const [respA, respB] = await Promise.all([
                fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: buildPayload(spA) }),
                fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: buildPayload(spB) }),
            ]);
            const [dataA, dataB] = await Promise.all([respA.json(), respB.json()]);

            if (!respA.ok) { showError("evaluate", dataA.error || "Suite run failed (SP A)"); setStatus("error", "Error"); return; }
            if (!respB.ok) { showError("evaluate", dataB.error || "Suite run failed (SP B)"); setStatus("error", "Error"); return; }

            // Header
            const headerDiv       = document.createElement("div");
            headerDiv.className   = "suite-run-header";
            headerDiv.textContent = `Suite compare: "${dataA.suite_name}" — ${dataA.results.length} items`;
            outputArea.appendChild(headerDiv);

            // Render each item pair side-by-side
            dataA.results.forEach((resultA, i) => {
                const resultB = dataB.results[i] || {};

                const wrapDiv = document.createElement("div");
                wrapDiv.className = "suite-run-item";

                const itemLabel       = document.createElement("div");
                itemLabel.className   = "suite-run-item-label";
                itemLabel.textContent = `${i + 1}. ${resultA.label}`;
                wrapDiv.appendChild(itemLabel);

                const cols = document.createElement("div");
                cols.className = "compare-cols";

                ["A", "B"].forEach((sp, j) => {
                    const result = j === 0 ? resultA : resultB;
                    const col    = document.createElement("div");
                    col.className = "compare-col";

                    const colLabel       = document.createElement("div");
                    colLabel.className   = "compare-col-label";
                    colLabel.textContent = `SP ${sp}`;
                    col.appendChild(colLabel);

                    if (result.error) {
                        col.appendChild(buildErrorEl("evaluate", result.error));
                    } else if (backendMode === "coach" && result.annotated_json) {
                        renderCommentCards(result.annotated_json, col);
                    } else {
                        const md     = document.createElement("div");
                        md.className = "markdown-output";
                        md.innerHTML = renderMarkdown(result.markdown || "");
                        col.appendChild(md);
                    }
                    cols.appendChild(col);
                });

                wrapDiv.appendChild(cols);
                outputArea.appendChild(wrapDiv);
            });

            // Collect markdown for download
            let mdA = `# Suite compare (SP A): ${dataA.suite_name}\n\n`;
            let mdB = `# Suite compare (SP B): ${dataB.suite_name}\n\n`;
            dataA.results.forEach((r, i) => { mdA += `## ${i + 1}. ${r.label}\n\n${r.markdown || ""}\n\n---\n\n`; });
            dataB.results.forEach((r, i) => { mdB += `## ${i + 1}. ${r.label}\n\n${r.markdown || ""}\n\n---\n\n`; });
            state.markdown  = mdA;
            state.markdownB = mdB;

            setStatus("complete", `Suite compare complete — ${dataA.results.length} items`);
            downloadRow.classList.remove("hidden");
            downloadBtnText.textContent = "SP A .md";
            downloadBtnB.classList.remove("hidden");

        } catch (e) {
            showError("evaluate", `Network error: ${e.message}`);
            setStatus("error", "Error");
        }

    } else {
        // Single SP suite run
        setStatus("evaluating", `Running suite (${selectedItems.length} of ${activeSuite.items.length} items)...`);
        try {
            const resp = await fetch(`/api/suites/${encodeURIComponent(activeSuite.filename)}/run`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    buildPayload(systemPrompt),
            });
            const data = await resp.json();
            if (!resp.ok) {
                showError("evaluate", data.error || "Suite run failed");
                setStatus("error", "Error");
                return;
            }

            const headerDiv       = document.createElement("div");
            headerDiv.className   = "suite-run-header";
            headerDiv.textContent = `Suite: "${data.suite_name}" — ${data.results.length} items`;
            outputArea.appendChild(headerDiv);

            let allMarkdown = `# Suite: ${data.suite_name}\n\n`;

            data.results.forEach((result, i) => {
                const wrapDiv       = document.createElement("div");
                wrapDiv.className   = "suite-run-item";
                const itemLabel     = document.createElement("div");
                itemLabel.className   = "suite-run-item-label";
                itemLabel.textContent = `${i + 1}. ${result.label}`;
                wrapDiv.appendChild(itemLabel);

                if (result.error) {
                    wrapDiv.appendChild(buildErrorEl("evaluate", result.error));
                    allMarkdown += `## ${i + 1}. ${result.label}\n\n*Error: ${result.error}*\n\n---\n\n`;
                } else if (backendMode === "coach" && result.annotated_json) {
                    renderCommentCards(result.annotated_json, wrapDiv);
                    allMarkdown += `## ${i + 1}. ${result.label}\n\n${result.markdown || ""}\n\n---\n\n`;
                } else {
                    const md       = document.createElement("div");
                    md.className   = "markdown-output";
                    md.innerHTML   = renderMarkdown(result.markdown || "");
                    wrapDiv.appendChild(md);
                    allMarkdown += `## ${i + 1}. ${result.label}\n\n${result.markdown || ""}\n\n---\n\n`;
                }
                outputArea.appendChild(wrapDiv);
            });

            state.markdown = allMarkdown;
            setStatus("complete", `Suite complete — ${data.results.length} items`);
            downloadRow.classList.remove("hidden");
        } catch (e) {
            showError("evaluate", `Network error: ${e.message}`);
            setStatus("error", "Error");
        }
    }
}

// Apply comment_selection to a flat list of suite items
function selectSuiteItems(items, selInfo) {
    if (!selInfo || selInfo.type === "all") return items;
    const total = items.length;
    if (selInfo.type === "range") {
        const start = Math.max(1, selInfo.start || 1);
        const end   = Math.min(total, selInfo.end || total);
        return items.slice(start - 1, end);
    }
    if (selInfo.type === "random") {
        const count    = Math.min(Math.max(1, selInfo.count || 4), total);
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }
    return items;
}

// ---------------------------------------------------------------------------
// Import suite from JSON file
// ---------------------------------------------------------------------------

let _importParsedData  = null;
let _importParsedType  = "comments";

async function handleImportSuite(e) {
    const file = e.target.files[0];
    if (!file) return;
    importSuiteInput.value = ""; // reset so same file can be re-imported

    let parsed;
    try {
        const text = await file.text();
        parsed = JSON.parse(text);
    } catch (err) {
        alert("Invalid JSON file.");
        return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        alert("Expected a JSON object.");
        return;
    }

    _importParsedData = parsed;

    // Pre-fill import modal
    const nameInput = document.getElementById("modal-import-name");
    nameInput.value = parsed.name || file.name.replace(/\.json$/i, "");

    const type = (parsed.type === "threads") ? "threads" : "comments";
    _setImportTypeToggle(type);

    const itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
    document.getElementById("modal-import-info").textContent =
        itemCount > 0 ? `${itemCount} item(s) found in file` : "No items found — suite will start empty";

    document.getElementById("modal-import-error").classList.add("hidden");
    openModal("modal-import-suite");
    setTimeout(() => nameInput.focus(), 50);
}

function _setImportTypeToggle(type) {
    _importParsedType = type;
    document.getElementById("modal-import-type-comments").classList.toggle("type-btn--active", type === "comments");
    document.getElementById("modal-import-type-threads").classList.toggle("type-btn--active",  type === "threads");
}

document.getElementById("modal-import-type-comments").addEventListener("click", () => _setImportTypeToggle("comments"));
document.getElementById("modal-import-type-threads").addEventListener("click",  () => _setImportTypeToggle("threads"));
document.getElementById("modal-import-cancel").addEventListener("click", () => closeModal("modal-import-suite"));
document.getElementById("modal-import-ok").addEventListener("click", submitImportSuite);
document.getElementById("modal-import-name").addEventListener("keydown", e => {
    if (e.key === "Enter") submitImportSuite();
});

async function submitImportSuite() {
    const name   = document.getElementById("modal-import-name").value.trim();
    const errEl  = document.getElementById("modal-import-error");
    if (!name) { document.getElementById("modal-import-name").focus(); return; }

    errEl.classList.add("hidden");

    const suite = {
        name,
        type:  _importParsedType,
        items: Array.isArray(_importParsedData.items) ? _importParsedData.items : [],
    };

    try {
        const resp = await fetch("/api/suites/import", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ suite }),
        });
        const data = await resp.json();
        if (!resp.ok) {
            errEl.textContent = data.error || "Import failed";
            errEl.classList.remove("hidden");
            return;
        }

        closeModal("modal-import-suite");
        await loadSuitesList();
        suiteSelect.value       = data.filename;
        activeSuite             = { filename: data.filename, ...data.suite };
        deleteSuiteBtn.disabled = false;
        updateSuiteInfo();
        renderSuiteItems();
        showInlineMsg(importSuiteBtn, `Imported "${data.suite.name}"`, "success");
    } catch (err) {
        errEl.textContent = "Network error";
        errEl.classList.remove("hidden");
    }
}

// ---------------------------------------------------------------------------
// Build comment_selection payload
// ---------------------------------------------------------------------------

function buildCommentSelection(backendMode) {
    if (backendMode !== "coach") return { type: "all" };
    const mode = commentModeSelect.value;
    if (mode === "range") {
        const start = parseInt(rangeStart.value);
        const end   = parseInt(rangeEnd.value);
        return { type: "range", start: isNaN(start) ? 1 : start, end: isNaN(end) ? 10 : end };
    }
    if (mode === "random") {
        const count = parseInt(randomCount.value);
        return { type: "random", count: isNaN(count) ? 4 : count };
    }
    return { type: "all" };
}

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

function handleModeChange() {
    if (window.PROMPTS && window.PROMPTS[modeSelect.value]) {
        promptTextarea.value = window.PROMPTS[modeSelect.value].text;
    }
    updateCommentSelectVisibility();
}

function updateCommentSelectVisibility() {
    const isCoach = modeSelect.value === "banjo_coach";
    commentSelectGroup.classList.toggle("hidden", !isCoach);
    updateCommentWarning();
}

function handleCommentModeChange() {
    const mode = commentModeSelect.value;
    rangeInputs.classList.toggle("hidden",  mode !== "range");
    randomInputs.classList.toggle("hidden", mode !== "random");
    updateCommentWarning();
}

function updateCommentWarning() {
    const isCoach = modeSelect.value === "banjo_coach";
    if (!isCoach) { commentWarning.classList.add("hidden"); return; }
    const mode = commentModeSelect.value;
    if (mode === "all") {
        commentWarning.textContent = "⚠ All comments selected — large threads may hit rate limits";
        commentWarning.className   = "comment-warning comment-warning--alert";
    } else if (mode === "range") {
        const s = rangeStart.value || "1";
        const e = rangeEnd.value   || "10";
        commentWarning.textContent = `→ Comments ${s}–${e} will be sent to the API`;
        commentWarning.className   = "comment-warning";
    } else {
        const n = randomCount.value || "4";
        commentWarning.textContent = `→ ${n} random comments will be sent to the API`;
        commentWarning.className   = "comment-warning";
    }
    commentWarning.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

async function handleDownloadMd(sp = "A") {
    const md = sp === "B" ? state.markdownB : state.markdown;
    if (!md) return;
    const suffix = state.compareMode ? `_SP${sp}` : "";
    await saveFileWithPicker(md, `${state.thinkId || "output"}${suffix}_evaluation.md`, "text/markdown", ".md");
}

async function handleDownloadJson() {
    if (!state.annotatedJson) return;
    await saveFileWithPicker(
        JSON.stringify(state.annotatedJson, null, 2),
        `${state.thinkId || "output"}_annotated.json`,
        "application/json",
        ".json"
    );
}

async function saveFileWithPicker(content, defaultName, mimeType, extension) {
    if (typeof window.showSaveFilePicker === "function") {
        try {
            const handle   = await window.showSaveFilePicker({
                suggestedName: defaultName,
                types: [{ description: extension.slice(1).toUpperCase() + " file", accept: { [mimeType]: [extension] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return;
        } catch (e) {
            if (e.name === "AbortError") return;
        }
    }
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: defaultName });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function setStatus(className, text) {
    statusBadge.className   = `status-badge ${className}`;
    statusBadge.textContent = text;
    statusBadge.classList.remove("hidden");
}

function showParseSummary(summary) {
    const div       = document.createElement("div");
    div.className   = "parse-summary";
    div.textContent = summary;
    outputArea.prepend(div);
}

function showError(stage, message) {
    outputArea.appendChild(buildErrorEl(stage, message));
}

function buildErrorEl(stage, message) {
    const labels = {
        fetch:    "Error during fetch",
        parse:    "Error during parse",
        evaluate: "Error during evaluation",
        save:     "Error saving",
    };
    const div = document.createElement("div");
    div.className = "error-message";
    div.innerHTML = `<div class="error-stage">${labels[stage] || "Error"}</div>
                     <div class="error-detail">${escapeHtml(message)}</div>`;
    return div;
}

function showMarkdown(md) {
    const div       = document.createElement("div");
    div.className   = "markdown-output";
    div.innerHTML   = renderMarkdown(md);
    outputArea.appendChild(div);
}

function showRunHint(text) {
    runHint.textContent = text;
    runHint.classList.remove("hidden");
    clearTimeout(showRunHint._timer);
    showRunHint._timer = setTimeout(() => runHint.classList.add("hidden"), 4000);
}

function showInlineMsg(anchorEl, text, type) {
    const existing = anchorEl.parentElement.querySelector(".inline-msg");
    if (existing) existing.remove();
    const span       = document.createElement("span");
    span.className   = `inline-msg inline-msg--${type}`;
    span.textContent = text;
    anchorEl.insertAdjacentElement("afterend", span);
    setTimeout(() => span.remove(), 5000);
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
    html = html.replace(/^---$/gm, "<hr>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g,     "<em>$1</em>");
    html = html.replace(/_(.+?)_/g,       "<em>$1</em>");
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    html = html.replace(/\n\n/g, "</p><p>");
    html = "<p>" + html + "</p>";
    html = html.replace(/<p>\s*(<h[123]>)/g,        "$1");
    html = html.replace(/(<\/h[123]>)\s*<\/p>/g,    "$1");
    html = html.replace(/<p>\s*(<pre>)/g,            "$1");
    html = html.replace(/(<\/pre>)\s*<\/p>/g,        "$1");
    html = html.replace(/<p>\s*(<ul>)/g,             "$1");
    html = html.replace(/(<\/ul>)\s*<\/p>/g,         "$1");
    html = html.replace(/<p>\s*(<blockquote>)/g,     "$1");
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*(<hr>)/g,             "$1");
    html = html.replace(/(<hr>)\s*<\/p>/g,           "$1");
    html = html.replace(/<p>\s*<\/p>/g,              "");
    html = html.replace(/\n/g, "<br>");
    return html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
