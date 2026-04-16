# Reddit Thread Thinks — SP Tester

An internal web tool for testing AI system prompts against real Reddit discussions. Built during a software engineering internship at Banjo, an edtech startup building AI-powered civil discourse tools for classrooms.

## What It Does

Banjo's core product coaches students through structured discussions using AI. The quality of that coaching depends heavily on the system prompts (SPs) used. This tool lets the team rapidly test and evaluate different prompts against real-world argumentative discussions sourced from Reddit's [r/ChangeMyView](https://www.reddit.com/r/changemyview/) — a community where users argue positions and genuinely try to change each other's minds.

## Running Locally

### Prerequisites

- Python 3.8+
- Groq API key (free at [console.groq.com](https://console.groq.com))

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/AStange12/Think-SP-tester.git
   cd Think-SP-tester/webapp
   ```

1. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

1. **Set up environment variables**

   Create a `.env` file inside the `webapp/` directory:

   ```env
   GROQ_API_KEY=your_api_key_here
   ```

1. **Add your system prompt**

   Open `webapp/prompts.py` and paste the real Coach / Moderation system prompt into the `banjo_coach` text field. The placeholder text is intentional — the real SP is kept out of the repo.

1. **Run the application**

   ```bash
   python app.py
   ```

1. **Open in browser**

   Navigate to: `http://localhost:5000`

> **Note:** The app is local-only. Reddit blocks server-side data fetches from cloud hosts (Render, Railway, etc.), so deployment requires Reddit OAuth registration before it can run in production.

---

## Workflow

### Single Thread

1. Paste a Reddit CMV thread URL and click **Run**
1. The app fetches and parses the thread into Think JSON (Banjo's internal discussion format)
1. Choose an evaluation mode and how many comments to send
1. Think JSON + the active system prompt are sent to the LLM API
1. Output renders as comment cards (Coach mode) or markdown (Summary mode)
1. Download results as `.md` or the annotated thread as `.json`

### Paste a Comment

1. Switch to the **Paste Comment** tab
1. Paste any comment text with optional author/source metadata
1. Click **Run** to evaluate immediately, or **Save to Suite** to store it without running

### Test Suites

Suites are JSON files in `webapp/test_suites/`. They can be committed and shared via git so the whole team works from the same test cases.

1. Click **+ New** to create a suite (Comments or Threads type)
1. Add items by saving threads, pasted comments, or individual cards from coach output
1. Select a suite from the dropdown — the Run button changes to **Run Suite**
1. All items in the suite are evaluated and results are displayed grouped by item
1. Use **↑ Import** to upload an existing suite JSON from disk

### SP Comparison

1. Toggle **Compare** to reveal a second SP textarea
1. Run as normal — both SPs execute in parallel on the same data
1. Output renders in two side-by-side columns (SP A / SP B)
1. Two separate download buttons appear for each result
1. Works for both single threads and suite runs

---

## Evaluation Modes

| Mode | Behaviour |
|---|---|
| **Coach / Moderation** | Evaluates each comment individually. Feedback stored as `moderation_feedback` on each node in the Think JSON. |
| **Summary** | Sends the full thread in one request. Summary stored under `metadata.summary_feedback`. |

### Comment Selection (Coach mode)

| Option | Description |
|---|---|
| All comments | Every comment/reply in the thread |
| Range | A slice by position (e.g. comments 5–15) |
| Random | N randomly selected comments |

Default is **4 random** to stay within free-tier rate limits on large threads. In Compare mode, the same randomly selected comments are sent to both SPs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| AI | Groq API — `llama-3.3-70b-versatile` (swap to Claude API — pending) |
| Frontend | Vanilla JS, Jinja2 templates |
| Fonts | Inter, JetBrains Mono |
| Reddit data | Reddit public `.json` API (no auth required for local use) |

---

## Project Structure

```
SP-tester/
├── .gitignore
├── README.md
└── webapp/
    ├── app.py                     # Flask routes + in-memory thread cache
    ├── claude_client.py           # Groq API client (named for upcoming Claude swap)
    ├── prompts.py                 # System prompt definitions — paste real SPs here
    ├── reddit_to_think_parser.py  # Fetches Reddit JSON, parses to Think JSON format
    ├── requirements.txt
    ├── test_suites/               # Shared test suite files (committed to repo)
    │   └── deleted_comment.json   # Example suite showing deleted comment handling
    ├── static/
    │   ├── css/style.css
    │   └── js/main.js
    └── templates/
        └── index.html
```

---

## Think JSON Format

Parsed threads are stored in Banjo's internal **Think JSON** format:

```json
{
  "think_id": "abc123",
  "proposition": "The original CMV claim",
  "created_at": "2026-01-01T00:00:00Z",
  "responses": [
    {
      "response_id": "xyz",
      "author": "username",
      "text": "Comment text...",
      "moderation_feedback": "LLM output (coach mode)",
      "replies": []
    }
  ],
  "metadata": {
    "source": "reddit",
    "total_comments": 142,
    "responses_included": 12,
    "summary_feedback": "LLM output (summary mode)"
  }
}
```

---

## Key Features

- **Smart caching** — parsed threads are held in memory; re-running with the same URL skips the fetch/parse step
- **Test suites** — shareable JSON files for Comments or Threads; committed to the repo so the team has a common baseline
- **Suite import/export** — upload a suite from disk or download results as `.md`
- **SP comparison** — run two system prompts side-by-side on the same data; random selection is resolved before both calls so results are directly comparable
- **Deleted comment skipping** — `[deleted]` and `[removed]` comments are silently skipped during evaluation
- **Duplicate detection** — adding the same comment text to a suite twice shows an error
- **Production message format** — user messages sent as `<topic>` + `<replies>` XML tags, matching Banjo's production Claude API format (temperature 0.2, max tokens 2000)
- **Native file save dialog** — download buttons use `window.showSaveFilePicker()` (Chrome/Edge) with a blob fallback for other browsers

---

## Pending / Next Steps

- **Claude API swap** — `claude_client.py` is ready to be pointed at the Anthropic API once a key is available. Tools/tool_choice structured output will be added at that point.
- **Deployment** — requires Reddit OAuth registration so Reddit doesn't block server-side fetches from cloud hosts.
- **Repo transfer** — moving to `cli-banjo-ai` org once invite is re-sent.
