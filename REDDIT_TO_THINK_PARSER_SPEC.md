# Reddit → Think JSON Parser Specification

## Project Overview

**Purpose:** Build a Python application that converts Reddit Change My View (CMV) discussions into Thinkifi's "Think" format for testing AI system prompts.

**Context:** Thinkifi is an edtech platform that facilitates civil discourse exercises. This parser will create test datasets from real Reddit discussions to evaluate how well Thinkifi's AI system prompts handle various argument structures and discussion patterns.

**Input:** Reddit JSON data (obtained by adding `.json` to any Reddit CMV URL)
**Output:** Structured Think JSON format with complete discussion threads

---

## Reddit JSON Structure

### Top-Level Array Structure
```
[
  {Listing 0} - Contains the original post (CMV proposition)
  {Listing 1} - Contains all comments (flat array)
]
```

### Listing 0: Post Data
Located at: `[0]["data"]["children"][0]["data"]`

**Key Fields:**
- `id` (string) - Unique post identifier (e.g., "1qsbrx6")
- `title` (string) - The CMV proposition
- `selftext` (string) - Full argument/explanation
- `author` (string) - Username of OP
- `created_utc` (float) - Unix timestamp
- `permalink` (string) - URL path to post
- `num_comments` (int) - Total comment count
- `ups` (int) - Upvote count
- `subreddit` (string) - Subreddit name (always "changemyview" for this use case)

### Listing 1: Comment Data
Located at: `[1]["data"]["children"]`

Each comment is in format: `{"kind": "t1", "data": {...}}`

**Key Fields (in each comment's `data` object):**
- `id` (string) - Unique comment identifier
- `body` (string) - Comment text content
- `author` (string) - Commenter username
- `created_utc` (float) - Unix timestamp
- `parent_id` (string) - What this comment replies to
  - Format `"t3_<post_id>"` = replying to post (top-level comment, depth 0)
  - Format `"t1_<comment_id>"` = replying to another comment (nested reply)
- `depth` (int) - Nesting level (0 = top-level, 1 = reply to top-level, etc.)
- `is_submitter` (bool) - True if comment author is the OP
- `ups` (int) - Upvote count
- `replies` (string or object) - Can be:
  - `""` (empty string) = no replies
  - `{"kind": "Listing", "data": {"children": [...]}}` = nested comments

**Important Notes:**
- Comments are stored in a **flat array** at `[1]["data"]["children"]`
- The nesting structure must be **reconstructed** using `parent_id` and `depth` fields
- `parent_id` prefix determines relationship:
  - `t3_` = student response (replying to post)
  - `t1_` = peer comment (replying to another comment)

---

## Think JSON Output Structure

```json
{
  "think_id": "<reddit_post_id>",
  "created_at": "<ISO 8601 timestamp>",
  "proposition": "<CMV title/claim>",
  
  "responses": [
    {
      "response_id": "<comment_id>",
      "author": "<username>",
      "text": "<comment_body>",
      "created_at": "<ISO 8601 timestamp>",
      "influences": <upvote_count>,
      "is_op": <boolean>,
      "exceeds_standard_format": <boolean>,
      
      "replies": [
        {
          "reply_id": "<comment_id>",
          "author": "<username>",
          "text": "<comment_body>",
          "created_at": "<ISO 8601 timestamp>",
          "influences": <upvote_count>,
          "is_op": <boolean>,
          "exceeds_standard_format": <boolean>,
          
          "replies": [
            // Recursive nesting - replies can have replies
          ]
        }
      ]
    }
  ],
  
  "metadata": {
    "source": "reddit_cmv",
    "source_url": "<full_reddit_url>",
    "subreddit": "<subreddit_name>",
    "total_comments": <num_comments>,
    "op_author": "<original_post_author>",
    "proposition_details": "<full selftext argument>",
    "responses_included": <count_of_top_level_responses>
  }
}
```

---

## Field Mappings: Reddit → Think

### Post Level
| Reddit Field | Think Field | Transformation |
|-------------|-------------|----------------|
| `[0]["data"]["children"][0]["data"]["id"]` | `think_id` | Direct copy |
| `[0]["data"]["children"][0]["data"]["title"]` | `proposition` | Direct copy |
| `[0]["data"]["children"][0]["data"]["created_utc"]` | `created_at` | Convert Unix timestamp to ISO 8601 string |
| `[0]["data"]["children"][0]["data"]["selftext"]` | `metadata.proposition_details` | Direct copy |
| `[0]["data"]["children"][0]["data"]["author"]` | `metadata.op_author` | Direct copy |
| `[0]["data"]["children"][0]["data"]["num_comments"]` | `metadata.total_comments` | Direct copy |
| `[0]["data"]["children"][0]["data"]["subreddit"]` | `metadata.subreddit` | Direct copy |
| `[0]["data"]["children"][0]["data"]["permalink"]` | `metadata.source_url` | Prepend "https://reddit.com" |

### Comment Level (Recursive)
| Reddit Field | Think Field | Transformation |
|-------------|-------------|----------------|
| `comment["data"]["id"]` | `response_id` or `reply_id` | Direct copy |
| `comment["data"]["body"]` | `text` | Direct copy |
| `comment["data"]["author"]` | `author` | Direct copy |
| `comment["data"]["created_utc"]` | `created_at` | Convert Unix timestamp to ISO 8601 string |
| `comment["data"]["ups"]` | `influences` | Direct copy |
| `comment["data"]["is_submitter"]` | `is_op` | Direct copy |
| `comment["data"]["depth"]` | (used for `exceeds_standard_format`) | If depth >= 2, set `exceeds_standard_format: true` |
| `comment["data"]["parent_id"]` | (used for tree building) | Determines where comment goes in hierarchy |

---

## Boolean Flag Logic

### `is_op` Field
- Set to `true` when `comment["data"]["is_submitter"] == true`
- Set to `false` otherwise
- Applies to ALL comments (responses and replies at any depth)

### `exceeds_standard_format` Field
- Set to `true` when `comment["data"]["depth"] >= 2`
- Set to `false` when `comment["data"]["depth"] < 2`
- **Rationale:** Traditional Think format is:
  - Depth 0: Student response to proposition
  - Depth 1: Peer comment on student response
  - Depth 2+: Goes beyond traditional format (deeper discussion threads)

---

## Implementation Algorithm

### High-Level Steps

1. **Load Reddit JSON**
   - Parse JSON file
   - Extract post data from `[0]`
   - Extract all comments from `[1]["data"]["children"]`

2. **Build Comment Hierarchy**
   - Create a mapping: `comment_id → comment_object`
   - For each comment, identify its parent using `parent_id`
   - Recursively nest comments under their parents
   - Handle `replies` field (can be empty string or nested Listing)

3. **Transform to Think Format**
   - Extract top-level comments (`parent_id` starts with `"t3_"`)
   - These become the `responses` array
   - Recursively transform nested comments into `replies` arrays
   - Apply boolean flags based on rules above
   - Convert timestamps to ISO 8601 format

4. **Build Metadata**
   - Populate metadata object with post information
   - Count responses included
   - Add source information

5. **Output JSON**
   - Write to file or return as string

### Detailed Pseudocode

```python
def parse_reddit_to_think(reddit_json):
    # Extract post data
    post_data = reddit_json[0]["data"]["children"][0]["data"]
    
    # Extract all comments (flat list)
    all_comments = reddit_json[1]["data"]["children"]
    
    # Build comment lookup map
    comment_map = {}
    for comment_wrapper in all_comments:
        comment = comment_wrapper["data"]
        comment_map[comment["id"]] = comment
    
    # Build tree structure
    # Group comments by parent_id
    children_by_parent = defaultdict(list)
    for comment in comment_map.values():
        children_by_parent[comment["parent_id"]].append(comment)
    
    # Find top-level comments (parent_id starts with "t3_")
    post_id = post_data["id"]
    top_level_parent = f"t3_{post_id}"
    top_level_comments = children_by_parent[top_level_parent]
    
    # Recursively build responses
    def build_response(comment):
        response = {
            "response_id" if comment["depth"] == 0 else "reply_id": comment["id"],
            "author": comment["author"],
            "text": comment["body"],
            "created_at": unix_to_iso(comment["created_utc"]),
            "influences": comment["ups"],
            "is_op": comment.get("is_submitter", False),
            "exceeds_standard_format": comment["depth"] >= 2,
            "replies": []
        }
        
        # Find children of this comment
        child_parent_id = f"t1_{comment['id']}"
        children = children_by_parent[child_parent_id]
        
        # Recursively add replies
        for child in children:
            response["replies"].append(build_response(child))
        
        return response
    
    # Build all responses
    responses = [build_response(c) for c in top_level_comments]
    
    # Build Think JSON
    think_json = {
        "think_id": post_data["id"],
        "created_at": unix_to_iso(post_data["created_utc"]),
        "proposition": post_data["title"],
        "responses": responses,
        "metadata": {
            "source": "reddit_cmv",
            "source_url": f"https://reddit.com{post_data['permalink']}",
            "subreddit": post_data["subreddit"],
            "total_comments": post_data["num_comments"],
            "op_author": post_data["author"],
            "proposition_details": post_data["selftext"],
            "responses_included": len(responses)
        }
    }
    
    return think_json

def unix_to_iso(unix_timestamp):
    from datetime import datetime
    return datetime.utcfromtimestamp(unix_timestamp).isoformat() + "Z"
```

---

## Edge Cases to Handle

### 1. Empty Replies Field
- Reddit comment `replies` can be `""` (empty string)
- Check if `replies == ""` before trying to parse as Listing

### 2. Deleted/Removed Comments
- Author might be `"[deleted]"` or `"[removed]"`
- Body might be `"[deleted]"` or `"[removed]"`
- Include these but flag in metadata if needed

### 3. Nested Listings in Replies
- The `replies` field structure mirrors top-level comment structure
- Path: `comment["replies"]["data"]["children"]`
- Each child has same structure: `{"kind": "t1", "data": {...}}`

### 4. Missing Fields
- Some fields might be `null` or missing
- Use `.get()` with defaults for safety
- Example: `comment.get("is_submitter", False)`

### 5. Deep Threads
- Some discussions can go 10+ levels deep
- No cutoff needed - keep entire chain
- Just flag `exceeds_standard_format: true` for depth >= 2

---

## Implementation Notes

### Recommended Python Libraries
```python
import json
from datetime import datetime
from collections import defaultdict
```

### File I/O
```python
# Reading
with open("reddit_data.json", "r", encoding="utf-8") as f:
    reddit_json = json.load(f)

# Writing
with open("think_output.json", "w", encoding="utf-8") as f:
    json.dump(think_json, f, indent=2, ensure_ascii=False)
```

### Handling Nested Replies Extraction

When a comment has replies, they're nested in this structure:
```python
if comment["replies"] != "":
    nested_comments = comment["replies"]["data"]["children"]
    for nested_comment_wrapper in nested_comments:
        nested_comment = nested_comment_wrapper["data"]
        # Process nested comment
```

However, since we're building from a flat list using `parent_id`, you can skip parsing the `replies` field entirely and just use the `parent_id` relationships.

---

## Testing Strategy

### Test Cases to Validate

1. **Simple Thread:**
   - 1 post
   - 2 top-level comments (depth 0)
   - 1 reply each (depth 1)
   - No deeper nesting

2. **Deep Thread:**
   - Comments going 5+ levels deep
   - Verify `exceeds_standard_format` flags correctly

3. **OP Participation:**
   - OP replies to multiple comments
   - Verify `is_op: true` on all OP comments

4. **Multiple Branches:**
   - One response with 3+ peer comments
   - Each peer comment with its own replies

5. **Edge Cases:**
   - Deleted comments
   - Empty replies fields
   - Comments with no upvotes (ups: 0)

### Validation Checks

- [ ] All top-level comments have `parent_id` starting with `"t3_"`
- [ ] All nested replies have correct parent-child relationships
- [ ] Timestamps are valid ISO 8601 format
- [ ] Boolean flags set correctly based on rules
- [ ] Total comment count matches between Reddit and Think output
- [ ] No comments are lost in transformation

---

## Example Input/Output

### Input Sample (abbreviated)
See attached `test1.json` file for complete Reddit JSON structure.

### Expected Output Sample
```json
{
  "think_id": "1qsbrx6",
  "created_at": "2024-12-01T12:30:13Z",
  "proposition": "CMV: Housing in the U.S. is expensive because of restrictive zoning...",
  
  "responses": [
    {
      "response_id": "o2udqh4",
      "author": "Brodman1986",
      "text": "He literally said he is going to keep home prices high...",
      "created_at": "2024-12-01T12:44:10Z",
      "influences": 17,
      "is_op": false,
      "exceeds_standard_format": false,
      
      "replies": [
        {
          "reply_id": "o2wpwse",
          "author": "Dave_A480",
          "text": "Trump is a moron, but when you look at the population breakdown...",
          "created_at": "2024-12-01T14:21:20Z",
          "influences": 6,
          "is_op": false,
          "exceeds_standard_format": false,
          
          "replies": [
            {
              "reply_id": "o34azys",
              "author": "impoverishedwhtebrd",
              "text": "I don't think the analogy makes the point...",
              "created_at": "2024-12-02T18:00:41Z",
              "influences": 1,
              "is_op": false,
              "exceeds_standard_format": true,
              "replies": []
            }
          ]
        }
      ]
    }
  ],
  
  "metadata": {
    "source": "reddit_cmv",
    "source_url": "https://reddit.com/r/changemyview/comments/1qsbrx6/...",
    "subreddit": "changemyview",
    "total_comments": 48,
    "op_author": "Opposite-Craft-3498",
    "proposition_details": "The reason house prices are high is because...",
    "responses_included": 1
  }
}
```

---

## Development Approach

### Step 1: Parse Input
- Load JSON
- Extract post and comments
- Verify structure matches specification

### Step 2: Build Comment Map
- Create `comment_id → comment_data` dictionary
- Create `parent_id → [child_comments]` grouping

### Step 3: Recursive Transform
- Start with top-level comments
- Recursively build nested structure
- Apply transformations and flags

### Step 4: Format Output
- Build final Think JSON structure
- Convert timestamps
- Calculate metadata

### Step 5: Validate & Test
- Run test cases
- Verify output structure
- Check edge cases

---

## Success Criteria

**Parser should:**
1. ✅ Convert any valid Reddit CMV JSON to Think format
2. ✅ Preserve all comments (no data loss)
3. ✅ Maintain correct parent-child relationships
4. ✅ Apply boolean flags correctly
5. ✅ Handle edge cases gracefully
6. ✅ Output valid, well-formatted JSON
7. ✅ Be reusable for multiple Reddit threads

---

## Next Steps After Implementation

1. Test with 3-4 diverse Reddit threads
2. Validate output matches expected Think format
3. Share sample outputs with Thinkifi team for feedback
4. Iterate on structure if needed
5. Document any additional edge cases discovered
6. Consider adding CLI interface for easy usage

---

## Additional Context

**Project Background:**
- Intern at Thinkifi working on AI system prompt testing
- First major project: create test dataset from real discussions
- Will be used to evaluate how AI handles different argument patterns
- Part of agile development process with daily standups

**Deliverables:**
- Working Python parser
- 3-4 sample Think JSON outputs
- Documentation of any issues/edge cases found

**Timeline:**
- Part of ongoing 15-week internship
- Current focus: build and test parser
- Future: may expand to other discussion sources

