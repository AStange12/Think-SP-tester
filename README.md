# Think SP Tester

An internal web tool for testing AI system prompts against real Reddit discussions. Built during a software engineering internship at Banjo, an edtech startup building AI-powered civil discourse tools for classrooms.

## What it does

Banjo's core product coaches students through structured discussions using AI. The quality of that coaching depends heavily on the system prompts used. This tool lets the team rapidly test and evaluate different prompts against real-world argumentative discussions sourced from Reddit's [r/ChangeMyView](https://www.reddit.com/r/changemyview/) — a community where users argue positions and genuinely try to change each other's minds.

## Running Locally

### Prerequisites
- Python 3.8+
- Groq API key (free at console.groq.com)

### Setup

1. **Clone the repository**
```bash
   git clone https://github.com/AStange12/Think-SP-tester.git
   cd Think-SP-tester/webapp
```

2. **Install dependencies**
```bash
   pip install -r requirements.txt
```

3. **Set up environment variables**
   
   Create a `.env` file in the `webapp/` directory:
```
   GROQ_API_KEY=your_api_key_here
```

4. **Run the application**
```bash
   python app.py
```

5. **Open in browser**
   
   Navigate to: http://localhost:5000

**Workflow:**
1. Paste a Reddit CMV thread URL
2. The app fetches and parses the thread into Think JSON (Banjo's internal discussion format)
3. Think JSON + a chosen system prompt are sent to Claude (Anthropic API)
4. Claude's evaluation is rendered as markdown in the output panel
5. Download the result as a `.md` file

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| AI | Anthropic Claude API (`anthropic` SDK) |
| Frontend | Vanilla JS, Jinja2 templates |
| Fonts | Inter, JetBrains Mono |
| Reddit data | Reddit public `.json` API (no auth required) |

## Current Status

| Component | Status |
|---|---|
| Reddit parser (`reddit_to_think_parser.py`) | Working |
| Flask API routes (`/api/parse`, `/api/evaluate`, `/api/prompts`) | Working |
| UI (input, output panel, download) | Working |
| Claude client (`claude_client.py`) | Stub — returns placeholder output |
| Real Claude API integration | Pending API key |

The full pipeline runs end-to-end with realistic placeholder output. Replacing the stub with the live API call is the immediate next step once the API key is available.

## Running Locally

```bash
# Clone and navigate to the webapp directory
git clone https://github.com/AStange12/Think-SP-tester.git
cd Think-SP-tester/webapp

# Install dependencies
pip install -r requirements.txt

# (Optional, required for live Claude output)
export ANTHROPIC_API_KEY=your_key_here

# Run
python app.py
```

App runs at `http://localhost:5000`.

> Without `ANTHROPIC_API_KEY` set, the app still runs — the evaluate step returns stub output.

## Project Structure

```
SP-tester/
├── reddit_to_think_parser.py      # Fetches Reddit JSON, parses to Think JSON format
├── REDDIT_TO_THINK_PARSER_SPEC.md # Think JSON format specification
├── Reddit JSONs/                  # Sample parsed discussions (test fixtures)
├── Reddit_to_Think.pen            # UI design mockup
└── webapp/
    ├── app.py                     # Flask routes
    ├── claude_client.py           # Anthropic API client (stub → real)
    ├── prompts.py                 # System prompt definitions
    ├── requirements.txt
    ├── static/
    │   ├── css/style.css
    │   └── js/main.js
    └── templates/
        └── index.html
```
