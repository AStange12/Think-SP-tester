"""Groq API client for Think JSON evaluation."""

import os
import copy
import html
import json
import random
import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL   = "llama-3.3-70b-versatile"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def _call_groq(system_prompt: str, user_content: str) -> str:
    """Single call to Groq API. Returns response text."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set. Add it to your .env file.")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
        "temperature": 0.2,
        "max_tokens": 2000,
    }

    try:
        resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=30)
    except requests.exceptions.Timeout:
        raise RuntimeError("Groq API request timed out (30s). Try again.")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Network error calling Groq API: {e}")

    if resp.status_code == 401:
        raise ValueError("Invalid GROQ_API_KEY — authentication failed. Check your .env file.")
    if resp.status_code == 429:
        raise RuntimeError("Groq rate limit reached. Wait a moment and try again.")
    if not resp.ok:
        raise RuntimeError(f"Groq API error {resp.status_code}: {resp.text[:300]}")

    return resp.json()["choices"][0]["message"]["content"]


def _collect_all_nodes(responses: list) -> list:
    """Return all response/reply dicts in depth-first order."""
    nodes = []
    for resp in responses:
        nodes.append(resp)
        nodes.extend(_collect_all_nodes(resp.get("replies", [])))
    return nodes


def _select_nodes(all_nodes: list, selection: dict) -> tuple:
    """Return (selected_nodes, description_str) based on selection dict.

    selection keys:
        type: "all" | "range" | "random"
        start, end  (1-indexed, inclusive) — for range
        count                              — for random
    """
    sel_type = (selection or {}).get("type", "all")
    total    = len(all_nodes)

    if sel_type == "ids":
        ids   = set(selection.get("ids", []))
        nodes = [n for n in all_nodes if (n.get("response_id") or n.get("reply_id")) in ids]
        desc  = f"_Evaluating {len(nodes)} selected comments._\n\n"
        return nodes, desc

    if sel_type == "range":
        start = max(1, int(selection.get("start", 1)))
        end   = min(total, int(selection.get("end", total)))
        nodes = all_nodes[start - 1 : end]  # convert to 0-indexed
        desc  = f"_Evaluating comments {start}–{end} of {total} total._\n\n"
        return nodes, desc

    if sel_type == "random":
        count = min(max(1, int(selection.get("count", 5))), total)
        nodes = random.sample(all_nodes, count)
        indices = sorted(all_nodes.index(n) + 1 for n in nodes)  # 1-indexed positions
        desc  = f"_Evaluating {count} randomly selected comments of {total} total (positions: {', '.join(map(str, indices))})._\n\n"
        return nodes, desc

    # "all"
    return all_nodes, ""


def _format_comment_text(text: str) -> str:
    """Replace > quoted lines with labeled context so the LLM knows
    they are referenced text, not the commenter's own words.
    Handles both decoded (>) and HTML-encoded (&gt;) quote markers
    so old saved threads work alongside newly parsed ones."""
    lines = []
    for line in html.unescape(text).split("\n"):
        stripped = line.lstrip("> ").strip()
        if line.lstrip().startswith(">") and stripped:
            lines.append(f"[quoting: \"{stripped}\"]")
        else:
            lines.append(line)
    return "\n".join(lines)


def _evaluate_coach(think_json: dict, system_prompt: str, comment_selection: dict = None) -> tuple:
    """Per-comment evaluation.

    Args:
        comment_selection: dict with keys type ("all"|"range"|"random"),
                           plus start/end for range, count for random.

    Returns (markdown_str, annotated_json_dict).
    """
    annotated  = copy.deepcopy(think_json)
    all_nodes  = _collect_all_nodes(annotated.get("responses", []))
    to_process, sel_desc = _select_nodes(all_nodes, comment_selection or {"type": "all"})

    results = []
    rate_limit_hit = None

    for resp in to_process:
        resp_id = resp.get("response_id") or resp.get("reply_id", "?")
        author  = resp.get("author", "unknown")
        text    = _format_comment_text((resp.get("text") or "").strip())
        if not text or text.lower() in ("[deleted]", "[removed]"):
            continue

        # Match production message format: <topic> + <replies>
        proposition = annotated.get("proposition", "")
        user_content = (
            f"Analyze the following discussion:\n"
            f"<topic>{proposition}</topic>\n"
            f"<replies>\n[1] [{author}] {text}\n</replies>"
        )

        try:
            feedback = _call_groq(system_prompt, user_content)
        except RuntimeError as e:
            if "rate limit" in str(e).lower():
                rate_limit_hit = str(e)
                break   # stop processing — return whatever we have so far
            raise       # re-raise non-rate-limit errors immediately

        # Insert moderation_feedback before "replies" so the field order in
        # the saved JSON reads: ...exceeds_think_format, moderation_feedback, replies
        replies = resp.pop("replies", [])
        resp["moderation_feedback"] = feedback
        resp["replies"] = replies

        snippet = text[:200] + ("..." if len(text) > 200 else "")
        results.append(
            f"### {author} (ID: {resp_id})\n\n"
            f"> {snippet}\n\n"
            f"{feedback}"
        )

    if not results:
        markdown = "# Coach/Moderation Evaluation\n\n_No comments found to evaluate._"
    else:
        header = "# Coach/Moderation Evaluation\n\n" + sel_desc
        body   = "\n\n---\n\n".join(results)
        if rate_limit_hit:
            body += (
                f"\n\n---\n\n"
                f"### ⚠ Rate limit reached\n\n"
                f"Evaluation stopped after {len(results)} comment(s). "
                f"Wait a moment and run again with the remaining range.\n\n"
                f"_{rate_limit_hit}_"
            )
        markdown = header + body

    return markdown, annotated


def _format_replies_xml(responses: list, counter: list = None) -> str:
    """Recursively build numbered <replies> lines from the response tree.

    Uses a shared mutable counter so reply numbering is globally sequential
    across nested replies, matching the production format.
    """
    if counter is None:
        counter = [0]
    lines = []
    for node in responses:
        text   = _format_comment_text((node.get("text") or "").strip())
        author = node.get("author", "unknown")
        if text and text.lower() not in ("[deleted]", "[removed]"):
            counter[0] += 1
            lines.append(f"[{counter[0]}] [{author}] {text}")
        lines.extend(_format_replies_xml(node.get("replies", []), counter))
    return "\n".join(lines)


def _evaluate_summary(think_json: dict, system_prompt: str) -> tuple:
    """Full-thread summary — sends entire thread in one call using production message format.

    Returns (markdown_str, annotated_json_dict) where annotated_json has
    the summary stored in metadata.summary_feedback.
    """
    annotated   = copy.deepcopy(think_json)
    proposition = think_json.get("proposition", "")
    replies_xml = _format_replies_xml(think_json.get("responses", []))

    content = (
        f"Analyze the following discussion:\n"
        f"<topic>{proposition}</topic>\n"
        f"<replies>\n{replies_xml}\n</replies>"
    )

    summary = _call_groq(system_prompt, content)
    annotated.setdefault("metadata", {})["summary_feedback"] = summary
    return summary, annotated


def evaluate_think(
    think_json:        dict,
    system_prompt:     str,
    mode:              str  = "coach",
    comment_selection: dict = None,
) -> dict:
    """Main evaluation entry point.

    Args:
        think_json:        Parsed Think JSON dict.
        system_prompt:     System prompt text from the UI.
        mode:              "coach" | "summary"
        comment_selection: For coach mode — dict with type/start/end/count.

    Returns:
        {"markdown": str, "annotated_json": dict | None}
    """
    if mode == "coach":
        md, annotated = _evaluate_coach(think_json, system_prompt, comment_selection)
        return {"markdown": md, "annotated_json": annotated}

    elif mode == "summary":
        md, annotated = _evaluate_summary(think_json, system_prompt)
        return {"markdown": md, "annotated_json": annotated}

    else:
        raise ValueError(f"Unknown evaluation mode: '{mode}'")
