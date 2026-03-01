"""Flask application for Reddit-to-Think web tool."""

import sys
import os
import json

from flask import Flask, render_template, request, jsonify

# Add parent directory so we can import the existing parser
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from reddit_to_think_parser import fetch_reddit_json, parse_reddit_to_think

from claude_client import evaluate_think
from prompts import SYSTEM_PROMPTS, DEFAULT_MODE

app = Flask(__name__)


@app.route("/")
def index():
    """Render the single-page application."""
    return render_template(
        "index.html",
        prompts=SYSTEM_PROMPTS,
        default_mode=DEFAULT_MODE,
    )


@app.route("/api/parse", methods=["POST"])
def api_parse():
    """Fetch Reddit URL, parse to Think JSON, return it.

    Request JSON: { "url": "https://reddit.com/r/..." }
    Response JSON: { "think_json": {...}, "summary": "..." }
    Error JSON:    { "error": "...", "stage": "fetch"|"parse" }
    """
    data = request.get_json()
    url = (data or {}).get("url", "").strip()

    if not url:
        return jsonify({"error": "URL is required", "stage": "fetch"}), 400

    if "reddit.com" not in url and "reddit" not in url:
        return jsonify({"error": "Please enter a valid Reddit URL", "stage": "fetch"}), 400

    # Step 1: Fetch
    try:
        reddit_json = fetch_reddit_json(url)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch Reddit data: {e}", "stage": "fetch"}), 500

    # Step 2: Parse
    try:
        think_json = parse_reddit_to_think(reddit_json)
    except Exception as e:
        return jsonify({"error": f"Failed to parse Reddit data: {e}", "stage": "parse"}), 500

    summary = (
        f"Parsed \"{think_json['proposition'][:80]}\" — "
        f"{think_json['metadata']['responses_included']} responses, "
        f"{think_json['metadata']['total_comments']} total comments"
    )

    return jsonify({"think_json": think_json, "summary": summary})


@app.route("/api/evaluate", methods=["POST"])
def api_evaluate():
    """Run Claude evaluation on Think JSON with system prompt.

    Request JSON: { "think_json": {...}, "system_prompt": "..." }
    Response JSON: { "markdown": "..." }
    Error JSON:    { "error": "...", "stage": "evaluate" }
    """
    data = request.get_json()
    think_json = (data or {}).get("think_json")
    system_prompt = (data or {}).get("system_prompt", "")

    if not think_json:
        return jsonify({"error": "think_json is required", "stage": "evaluate"}), 400

    if not system_prompt.strip():
        return jsonify({"error": "System prompt cannot be empty", "stage": "evaluate"}), 400

    try:
        markdown = evaluate_think(think_json, system_prompt)
    except Exception as e:
        return jsonify({"error": f"Evaluation failed: {e}", "stage": "evaluate"}), 500

    return jsonify({"markdown": markdown})


@app.route("/api/prompts", methods=["GET"])
def api_prompts():
    """Return available system prompt modes."""
    return jsonify({"prompts": SYSTEM_PROMPTS, "default": DEFAULT_MODE})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
