import html
import json
import os
import sys
import requests
from datetime import datetime, timezone
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def unix_to_iso(unix_timestamp):
    """Convert Unix timestamp to ISO 8601 string."""
    return datetime.fromtimestamp(unix_timestamp, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def extract_all_comments(children):
    """Recursively extract all comments from nested Reddit reply structure.

    The flat array at [1]["data"]["children"] only contains top-level comments.
    Deeper comments are nested inside each comment's `replies` field, so we must
    walk the tree to collect every comment before rebuilding via parent_id.
    """
    comments = []
    for child in children:
        if child.get("kind") != "t1":
            continue
        data = child["data"]
        comments.append(data)
        replies = data.get("replies")
        if replies and isinstance(replies, dict):
            nested = replies.get("data", {}).get("children", [])
            comments.extend(extract_all_comments(nested))
    return comments


def build_response(comment, children_by_parent):
    """Recursively build a Think-format response/reply object."""
    depth = comment.get("depth", 0)
    id_key = "response_id" if depth == 0 else "reply_id"

    response = {
        id_key: comment["id"],
        "author": comment.get("author", "[unknown]"),
        "text": html.unescape(comment.get("body", "")),
        "created_at": unix_to_iso(comment["created_utc"]),
        "influences": comment.get("ups", 0),
        "is_think_manager": comment.get("is_submitter", False),
        "exceeds_think_format": depth >= 2,
        "replies": [],
    }

    child_parent_id = f"t1_{comment['id']}"
    for child in children_by_parent.get(child_parent_id, []):
        response["replies"].append(build_response(child, children_by_parent))

    return response


def parse_reddit_to_think(reddit_json):
    """Convert Reddit CMV JSON to Think JSON format."""
    # --- Extract post data ---
    post_data = reddit_json[0]["data"]["children"][0]["data"]

    # --- Extract and flatten all comments ---
    top_children = reddit_json[1]["data"]["children"]
    all_comments = extract_all_comments(top_children)

    # --- Build parent_id → children mapping ---
    children_by_parent = defaultdict(list)
    for comment in all_comments:
        children_by_parent[comment["parent_id"]].append(comment)

    # --- Identify top-level comments ---
    top_level_parent = f"t3_{post_data['id']}"
    top_level_comments = children_by_parent[top_level_parent]

    # --- Build responses recursively ---
    responses = [build_response(c, children_by_parent) for c in top_level_comments]

    # --- Assemble Think JSON ---
    think_json = {
        "think_id": post_data["id"],
        "created_at": unix_to_iso(post_data["created_utc"]),
        "proposition": post_data["title"],
        "responses": responses,
        "metadata": {
            "source": f"reddit_{post_data['subreddit']}",
            "source_url": f"https://reddit.com{post_data['permalink']}",
            "subreddit": post_data["subreddit"],
            "total_comments": post_data["num_comments"],
            "op_author": post_data["author"],
            "proposition_details": post_data["selftext"],
            "responses_included": len(responses),
        },
    }

    return think_json


def count_think_comments(responses):
    """Count total comments in Think output (responses + all nested replies)."""
    total = 0
    for r in responses:
        total += 1
        total += count_think_comments(r.get("replies", []))
    return total


def fetch_reddit_json(url):
    """Fetch JSON data from a Reddit URL."""
    url = url.replace("www.reddit.com", "old.reddit.com")
    url = url.rstrip("/")
    if not url.endswith(".json"):
        url += "/.json"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()


def main():
    url = input("Enter a Reddit post URL: ").strip()

    print("Fetching data from Reddit...")
    reddit_json = fetch_reddit_json(url)

    think_json = parse_reddit_to_think(reddit_json)

    # Save output using the post id as the filename
    output_path = os.path.join(SCRIPT_DIR, "Reddit JSONs", f"{think_json['think_id']}_think.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(think_json, f, indent=2, ensure_ascii=False)

    # --- Validation summary ---
    total_in_output = count_think_comments(think_json["responses"])
    print(f"Output: {output_path}")
    print(f"Post:   {think_json['think_id']}")
    print(f"Proposition: {think_json['proposition'][:80]}...")
    print(f"Top-level responses: {think_json['metadata']['responses_included']}")
    print(f"Total comments in output: {total_in_output}")
    print(f"Reddit num_comments field: {think_json['metadata']['total_comments']}")
    if total_in_output == think_json["metadata"]["total_comments"]:
        print("PASS: Comment counts match.")
    else:
        print(f"NOTE: Counts differ (output={total_in_output}, reddit={think_json['metadata']['total_comments']}). "
              "This can happen when Reddit truncates deep threads or 'more' stubs exist.")


if __name__ == "__main__":
    main()
