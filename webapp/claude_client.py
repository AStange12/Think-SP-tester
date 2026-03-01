"""Claude API client for Think JSON evaluation.

STUB VERSION: Returns placeholder markdown so the full pipeline can be
tested end-to-end before the API key arrives Monday.
"""


def evaluate_think(think_json: dict, system_prompt: str) -> str:
    """Send Think JSON + system prompt to Claude and return markdown response.

    Args:
        think_json: Parsed Think JSON dict from the Reddit parser.
        system_prompt: The system prompt text to use for evaluation.

    Returns:
        Markdown string with the evaluation results.
    """
    proposition = think_json.get("proposition", "Unknown proposition")
    metadata = think_json.get("metadata", {})
    num_responses = metadata.get("responses_included", 0)
    total_comments = metadata.get("total_comments", 0)
    source_url = metadata.get("source_url", "N/A")
    op = metadata.get("op_author", "Unknown")

    return f"""# Evaluation Report (STUB)

> **This is placeholder output.** Real Claude API evaluation will replace
> this once the API key is configured.

## Proposition

**"{proposition}"** — posted by u/{op}

## Summary

- **Responses analyzed:** {num_responses}
- **Total comments:** {total_comments}
- **Source:** {source_url}

## System Prompt Used

```
{system_prompt[:200]}{"..." if len(system_prompt) > 200 else ""}
```

## Analysis

_Pending real API integration. The Think JSON was parsed successfully
and is ready to be sent to Claude for evaluation._

The parsed discussion contains **{num_responses} top-level responses** from
{total_comments} total comments. Once the Anthropic API key is connected,
this section will contain the full moderation and coaching analysis.

## Next Steps

1. Set `ANTHROPIC_API_KEY` environment variable
2. Replace stub in `claude_client.py` with real SDK call
3. Re-run to get actual evaluation
"""
