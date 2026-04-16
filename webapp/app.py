"""Flask application for Reddit-to-Think web tool."""

import os
import json
import re
import uuid

from flask import Flask, render_template, request, jsonify

from reddit_to_think_parser import fetch_reddit_json, parse_reddit_to_think
from claude_client import evaluate_think
from prompts import SYSTEM_PROMPTS, DEFAULT_MODE

app = Flask(__name__)

SUITES_DIR = os.path.join(os.path.dirname(__file__), "test_suites")

# In-memory cache: { think_id: think_json }
thread_cache = {}


def _safe_suite_path(filename):
    """Return absolute path for a suite file, or None if path is unsafe."""
    base = os.path.basename(filename)
    if not base.endswith(".json"):
        base += ".json"
    path = os.path.join(SUITES_DIR, base)
    if not os.path.abspath(path).startswith(os.path.abspath(SUITES_DIR)):
        return None
    return path


def _sanitize_name(name):
    """Convert a display name to a safe filename base."""
    return re.sub(r'[^\w\-]', '-', name).strip('-') or "suite"


@app.route("/")
def index():
    return render_template("index.html", prompts=SYSTEM_PROMPTS, default_mode=DEFAULT_MODE)


@app.route("/api/parse", methods=["POST"])
def api_parse():
    """Fetch Reddit URL, parse to Think JSON, cache it, return it.

    Request:  { "url": "..." }
    Response: { "think_json": {...}, "summary": "...", "cached": bool }
    """
    data = request.get_json()
    url  = (data or {}).get("url", "").strip()

    if not url:
        return jsonify({"error": "URL is required", "stage": "fetch"}), 400
    if "reddit.com" not in url:
        return jsonify({"error": "Please enter a valid Reddit URL", "stage": "fetch"}), 400

    try:
        reddit_json = fetch_reddit_json(url)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch Reddit data: {e}", "stage": "fetch"}), 500

    try:
        think_json = parse_reddit_to_think(reddit_json)
    except Exception as e:
        return jsonify({"error": f"Failed to parse Reddit data: {e}", "stage": "parse"}), 500

    think_id = think_json.get("think_id", "unknown")
    cached   = think_id in thread_cache
    thread_cache[think_id] = think_json

    summary = (
        f"Parsed \"{think_json['proposition'][:80]}\" — "
        f"{think_json['metadata']['responses_included']} responses, "
        f"{think_json['metadata']['total_comments']} total comments"
        + (" (loaded from cache)" if cached else "")
    )
    return jsonify({"think_json": think_json, "summary": summary, "cached": cached})


@app.route("/api/evaluate", methods=["POST"])
def api_evaluate():
    """Run LLM evaluation on Think JSON.

    Request:  { "think_json": {...}, "system_prompt": "...", "mode": "coach"|"summary", "comment_selection": {...} }
    Response: { "markdown": "...", "annotated_json": {...} }
    """
    data          = request.get_json()
    think_json    = (data or {}).get("think_json")
    system_prompt = (data or {}).get("system_prompt", "")
    mode          = (data or {}).get("mode", "coach")
    comment_selection = (data or {}).get("comment_selection") or {"type": "all"}

    if not think_json:
        return jsonify({"error": "think_json is required", "stage": "evaluate"}), 400
    if not system_prompt.strip():
        return jsonify({"error": "System prompt cannot be empty", "stage": "evaluate"}), 400
    if mode not in ("coach", "summary"):
        return jsonify({"error": f"Unknown mode: {mode}", "stage": "evaluate"}), 400

    try:
        result = evaluate_think(think_json, system_prompt, mode, comment_selection)
    except ValueError as e:
        return jsonify({"error": str(e), "stage": "evaluate"}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e), "stage": "evaluate"}), 502
    except Exception as e:
        return jsonify({"error": f"Evaluation failed: {e}", "stage": "evaluate"}), 500

    return jsonify({"markdown": result["markdown"], "annotated_json": result.get("annotated_json")})


# ---------------------------------------------------------------------------
# Test Suite routes
# ---------------------------------------------------------------------------

@app.route("/api/suites", methods=["GET"])
def api_list_suites():
    """List all test suites with metadata."""
    os.makedirs(SUITES_DIR, exist_ok=True)
    suites = []
    for f in sorted(os.listdir(SUITES_DIR)):
        if not f.endswith(".json"):
            continue
        path = os.path.join(SUITES_DIR, f)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            suites.append({
                "filename": f,
                "name":     data.get("name", f),
                "type":     data.get("type", "comments"),
                "count":    len(data.get("items", [])),
            })
        except Exception:
            pass
    return jsonify({"suites": suites})


@app.route("/api/suites", methods=["POST"])
def api_create_suite():
    """Create a new test suite.

    Request:  { "name": "...", "type": "comments"|"threads" }
    Response: { "created": true, "filename": "...", "suite": {...} }
    """
    data       = request.get_json()
    name       = (data or {}).get("name", "").strip()
    suite_type = (data or {}).get("type", "comments")

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if suite_type not in ("comments", "threads"):
        return jsonify({"error": "type must be 'comments' or 'threads'"}), 400

    filename = _sanitize_name(name) + ".json"
    path     = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid name"}), 400

    os.makedirs(SUITES_DIR, exist_ok=True)
    if os.path.exists(path):
        return jsonify({"error": "A suite with that name already exists"}), 409

    suite = {"name": name, "type": suite_type, "items": []}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(suite, f, indent=2, ensure_ascii=False)

    return jsonify({"created": True, "filename": filename, "suite": suite})


@app.route("/api/suites/<filename>", methods=["GET"])
def api_load_suite(filename):
    """Return a suite's full contents."""
    path = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": "Suite not found"}), 404
    with open(path, "r", encoding="utf-8") as f:
        suite = json.load(f)
    return jsonify({"suite": suite})


@app.route("/api/suites/<filename>", methods=["DELETE"])
def api_delete_suite(filename):
    """Delete a test suite file."""
    path = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": "Suite not found"}), 404
    os.remove(path)
    return jsonify({"deleted": True})


@app.route("/api/suites/<filename>/items", methods=["POST"])
def api_add_suite_item(filename):
    """Add an item to a suite.

    Request:  { "item": { "text": "...", "author": "...", ... } }
    Response: { "added": true, "item_id": "..." }
    """
    path = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": "Suite not found"}), 404

    data = request.get_json()
    item = (data or {}).get("item")
    if not item:
        return jsonify({"error": "item is required"}), 400

    with open(path, "r", encoding="utf-8") as f:
        suite = json.load(f)

    # Duplicate check for comment suites
    if suite.get("type") == "comments":
        new_text = (item.get("text") or "").strip().lower()
        if new_text:
            for existing in suite.get("items", []):
                if (existing.get("text") or "").strip().lower() == new_text:
                    return jsonify({
                        "error": "duplicate",
                        "message": "This comment already exists in this suite.",
                    }), 409

    item["id"] = str(uuid.uuid4())[:8]
    suite["items"].append(item)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(suite, f, indent=2, ensure_ascii=False)

    return jsonify({"added": True, "item_id": item["id"]})


@app.route("/api/suites/<filename>/items/<item_id>", methods=["DELETE"])
def api_remove_suite_item(filename, item_id):
    """Remove an item from a suite by id."""
    path = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": "Suite not found"}), 404

    with open(path, "r", encoding="utf-8") as f:
        suite = json.load(f)
    suite["items"] = [i for i in suite["items"] if i.get("id") != item_id]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(suite, f, indent=2, ensure_ascii=False)

    return jsonify({"removed": True})


@app.route("/api/suites/<filename>/run", methods=["POST"])
def api_run_suite(filename):
    """Run evaluation against every item in a suite.

    Request:  { "system_prompt": "...", "mode": "coach"|"summary" }
    Response: { "results": [...], "suite_name": "...", "suite_type": "..." }
    """
    path = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": "Suite not found"}), 404

    data              = request.get_json()
    system_prompt     = (data or {}).get("system_prompt", "")
    mode              = (data or {}).get("mode", "coach")
    item_ids          = (data or {}).get("item_ids")          # optional list to filter items
    comment_selection = (data or {}).get("comment_selection") or {"type": "all"}

    if not system_prompt.strip():
        return jsonify({"error": "System prompt cannot be empty"}), 400

    with open(path, "r", encoding="utf-8") as f:
        suite = json.load(f)

    items = suite.get("items", [])
    if item_ids is not None:
        id_set = set(item_ids)
        items  = [i for i in items if i.get("id") in id_set]

    results = []
    for item in items:
        if suite["type"] == "comments":
            think_json = {
                "think_id":   f"suite_{item['id']}",
                "proposition": item.get("source", "[Suite Comment]"),
                "created_at": "",
                "responses": [{
                    "response_id":        item["id"],
                    "author":             item.get("author", "Unknown"),
                    "text":               item.get("text", ""),
                    "created_at":         "",
                    "influences":         0,
                    "is_think_manager":   False,
                    "exceeds_think_format": False,
                    "replies":            [],
                }],
                "metadata": {
                    "source": "suite", "source_url": "", "subreddit": "",
                    "total_comments": 1, "op_author": "",
                    "proposition_details": "", "responses_included": 1,
                },
            }
        else:
            think_json = item.get("think_json", {})

        label = item.get("author") or item.get("name") or item.get("id", "?")
        try:
            # For threads suites, pass comment_selection so you can pick comments within each thread.
            # For comments suites, each item is a single comment — always evaluate all.
            sel = comment_selection if suite["type"] == "threads" else {"type": "all"}
            result = evaluate_think(think_json, system_prompt, mode, sel)
            results.append({
                "id":            item["id"],
                "label":         label,
                "markdown":      result["markdown"],
                "annotated_json": result.get("annotated_json"),
                "error":         None,
            })
        except Exception as e:
            results.append({
                "id": item["id"], "label": label,
                "markdown": None, "annotated_json": None, "error": str(e),
            })

    return jsonify({
        "results":    results,
        "suite_name": suite["name"],
        "suite_type": suite["type"],
    })


@app.route("/api/resolve-selection", methods=["POST"])
def api_resolve_selection():
    """Resolve a random/range selection to explicit node IDs.

    Used by compare mode so both SPs evaluate the exact same comments.
    Request:  { "think_json": {...}, "comment_selection": {...} }
    Response: { "ids": ["abc", "def", ...] }
    """
    from claude_client import _collect_all_nodes, _select_nodes
    data              = request.get_json()
    think_json        = (data or {}).get("think_json")
    comment_selection = (data or {}).get("comment_selection") or {"type": "all"}

    if not think_json:
        return jsonify({"error": "think_json is required"}), 400

    all_nodes = _collect_all_nodes(think_json.get("responses", []))
    selected, _ = _select_nodes(all_nodes, comment_selection)
    ids = [n.get("response_id") or n.get("reply_id") for n in selected
           if n.get("response_id") or n.get("reply_id")]
    return jsonify({"ids": ids})


@app.route("/api/suites/import", methods=["POST"])
def api_import_suite():
    """Import a full suite JSON uploaded from the client.

    Request:  { "suite": { "name": "...", "type": "...", "items": [...] } }
    Response: { "imported": true, "filename": "...", "suite": {...} }
    """
    import time as _time
    data       = request.get_json()
    suite_data = (data or {}).get("suite")
    if not suite_data:
        return jsonify({"error": "suite data is required"}), 400

    name       = (suite_data.get("name") or "imported").strip()
    suite_type = suite_data.get("type", "comments")
    items      = suite_data.get("items", [])

    if suite_type not in ("comments", "threads"):
        return jsonify({"error": "type must be 'comments' or 'threads'"}), 400

    os.makedirs(SUITES_DIR, exist_ok=True)
    filename = _sanitize_name(name) + ".json"
    path     = _safe_suite_path(filename)
    if path is None:
        return jsonify({"error": "Invalid name"}), 400

    # Avoid overwriting — append timestamp suffix if file exists
    if os.path.exists(path):
        filename = _sanitize_name(name) + f"_{int(_time.time())}.json"
        path     = _safe_suite_path(filename)
        if path is None:
            return jsonify({"error": "Invalid name"}), 400

    # Re-assign IDs to avoid collisions
    for item in items:
        item["id"] = str(uuid.uuid4())[:8]

    suite = {"name": name, "type": suite_type, "items": items}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(suite, f, indent=2, ensure_ascii=False)

    return jsonify({"imported": True, "filename": filename, "suite": suite})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
