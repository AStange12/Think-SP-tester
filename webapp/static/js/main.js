/**
 * Reddit-to-Think Web App — Frontend Logic
 *
 * Handles: Run button flow (parse → evaluate), mode switching,
 * markdown rendering, download, and error display.
 */

// --- State ---
const state = {
    thinkJson: null,
    markdown: null,
    thinkId: null,
};

// --- DOM refs ---
const urlInput = document.getElementById("url-input");
const promptTextarea = document.getElementById("prompt-textarea");
const modeSelect = document.getElementById("mode-select");
const runBtn = document.getElementById("run-btn");
const statusBadge = document.getElementById("status-badge");
const outputArea = document.getElementById("output-area");
const downloadRow = document.getElementById("download-row");
const downloadBtn = document.getElementById("download-btn");

// --- Event listeners ---
runBtn.addEventListener("click", handleRun);
modeSelect.addEventListener("change", handleModeChange);
downloadBtn.addEventListener("click", handleDownload);

// Allow Ctrl+Enter to trigger Run from the URL input or textarea
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
        handleRun();
    }
});

// --- Main flow ---
async function handleRun() {
    const url = urlInput.value.trim();
    if (!url) {
        urlInput.focus();
        return;
    }

    const systemPrompt = promptTextarea.value.trim();
    if (!systemPrompt) {
        promptTextarea.focus();
        return;
    }

    // Reset state
    state.thinkJson = null;
    state.markdown = null;
    state.thinkId = null;
    downloadRow.classList.add("hidden");
    runBtn.disabled = true;

    // Step 1: Fetch & Parse
    setStatus("fetching", "Fetching...");
    outputArea.innerHTML = "";

    let parseResult;
    try {
        const resp = await fetch("/api/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
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

    state.thinkJson = parseResult.think_json;
    state.thinkId = parseResult.think_json.think_id || "output";
    setStatus("parsing", "Parsed");
    showParseSummary(parseResult.summary);

    // Step 2: Evaluate
    setStatus("evaluating", "Evaluating...");

    let evalResult;
    try {
        const resp = await fetch("/api/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                think_json: state.thinkJson,
                system_prompt: systemPrompt,
            }),
        });
        evalResult = await resp.json();

        if (!resp.ok) {
            showError(evalResult.stage || "evaluate", evalResult.error || "Unknown error");
            setStatus("error", "Error");
            runBtn.disabled = false;
            return;
        }
    } catch (e) {
        showError("evaluate", `Network error: ${e.message}`);
        setStatus("error", "Error");
        runBtn.disabled = false;
        return;
    }

    state.markdown = evalResult.markdown;
    showMarkdown(evalResult.markdown);
    setStatus("complete", "Complete");
    downloadRow.classList.remove("hidden");
    runBtn.disabled = false;
}

// --- Mode switching ---
function handleModeChange() {
    const mode = modeSelect.value;
    if (window.PROMPTS && window.PROMPTS[mode]) {
        promptTextarea.value = window.PROMPTS[mode].text;
    }
}

// --- Download ---
function handleDownload() {
    if (!state.markdown) return;

    const blob = new Blob([state.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.thinkId}_evaluation.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- UI helpers ---
function setStatus(className, text) {
    statusBadge.className = `status-badge ${className}`;
    statusBadge.textContent = text;
    statusBadge.classList.remove("hidden");
}

function showParseSummary(summary) {
    const div = document.createElement("div");
    div.className = "parse-summary";
    div.textContent = summary;
    outputArea.prepend(div);
}

function showError(stage, message) {
    const stageLabels = {
        fetch: "Error during fetch",
        parse: "Error during parse",
        evaluate: "Error during evaluation",
    };

    const div = document.createElement("div");
    div.className = "error-message";
    div.innerHTML = `
        <div class="error-stage">${stageLabels[stage] || "Error"}</div>
        <div class="error-detail">${escapeHtml(message)}</div>
    `;
    outputArea.appendChild(div);
}

function showMarkdown(md) {
    const div = document.createElement("div");
    div.className = "markdown-output";
    div.innerHTML = renderMarkdown(md);
    outputArea.appendChild(div);
}

// --- Markdown renderer ---
function renderMarkdown(text) {
    let html = escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Headings
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

    // Horizontal rules
    html = html.replace(/^---$/gm, "<hr>");

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/_(.+?)_/g, "<em>$1</em>");

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

    // Paragraphs (double newlines)
    html = html.replace(/\n\n/g, "</p><p>");
    html = "<p>" + html + "</p>";

    // Clean up empty paragraphs around block elements
    html = html.replace(/<p>\s*(<h[123]>)/g, "$1");
    html = html.replace(/(<\/h[123]>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*(<pre>)/g, "$1");
    html = html.replace(/(<\/pre>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*(<ul>)/g, "$1");
    html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*(<blockquote>)/g, "$1");
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*(<hr>)/g, "$1");
    html = html.replace(/(<hr>)\s*<\/p>/g, "$1");
    html = html.replace(/<p>\s*<\/p>/g, "");

    // Single newlines → <br> inside paragraphs
    html = html.replace(/\n/g, "<br>");

    return html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
