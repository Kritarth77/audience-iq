#!/usr/bin/env python3
"""
scrape.py - search Reddit RSS feeds for brand mentions and write them to
records.csv in the backend pipeline schema.

Usage:
    python scrape.py
"""
import csv
import json
import time
import uuid
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

# ----------------------------- config ---------------------------------
SEARCH_KEYWORDS = ["Zomato", "Reliance Jio", "Tata Motors", "Flipkart", "Air India"]
POSTS_PER_SUBREDDIT = 100          # Reddit caps a single page at 100
OUTPUT_FILE = "records.csv"
REQUEST_DELAY_SECONDS = 2          # be polite between subreddits
MAX_RETRIES = 3

COLUMNS = [
    "id", "platform", "target", "record_type", "external_id", "author_id",
    "text", "source_url", "published_at", "metadata", "dedup_key",
]

BAD_TEXT = {"", "[removed]", "[deleted]"}

# ----------------------------- helpers --------------------------------
def scrape_reddit_search(keyword, limit=25):
    """Fetch and normalize recent Reddit posts matching a brand keyword."""

    url = f"https://www.reddit.com/search.rss?q={quote_plus(keyword)}&sort=new"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            root = ET.fromstring(response.read())

        atom_namespace = {"atom": "http://www.w3.org/2005/Atom"}
        posts = []
        for entry in root.findall("atom:entry", atom_namespace)[:limit]:
            entry_id = entry.findtext("atom:id", default="", namespaces=atom_namespace)
            title = entry.findtext("atom:title", default="", namespaces=atom_namespace)
            content = entry.findtext(
                "atom:content", default="", namespaces=atom_namespace
            )
            published = entry.findtext(
                "atom:published", default="", namespaces=atom_namespace
            )
            author = entry.findtext(
                "atom:author/atom:name",
                default="",
                namespaces=atom_namespace,
            )
            links = entry.findall("atom:link", atom_namespace)
            permalink = next(
                (
                    link.attrib.get("href", "")
                    for link in links
                    if link.attrib.get("rel") == "alternate"
                ),
                "",
            )
            if not permalink:
                permalink = next(
                    (link.attrib.get("href", "") for link in links),
                    "",
                )

            try:
                created_utc = datetime.fromisoformat(
                    published.replace("Z", "+00:00")
                ).timestamp()
            except (TypeError, ValueError, OverflowError):
                try:
                    created_utc = parsedate_to_datetime(published).timestamp()
                except (TypeError, ValueError, OverflowError):
                    created_utc = datetime.now(timezone.utc).timestamp()

            post_id = entry_id.rsplit("/", 1)[-1] if entry_id else ""
            if post_id.startswith("t3_"):
                post_id = post_id[3:]
            if not post_id:
                continue

            posts.append(
                {
                    "id": post_id,
                    "title": title,
                    "text": content,
                    "author": author,
                    "upvotes": 0,
                    "created_utc": created_utc,
                    "url": permalink,
                    "permalink": permalink.replace("https://www.reddit.com", ""),
                }
            )
        return posts
    except (ET.ParseError, urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"  [search:{keyword}] request failed: {exc}")
        return None


def fetch_search(keyword):
    """Return recent posts matching a keyword with retries."""

    for attempt in range(1, MAX_RETRIES + 1):
        posts = scrape_reddit_search(keyword, POSTS_PER_SUBREDDIT)
        if posts is not None:
            return posts
        print(f"  [search:{keyword}] attempt {attempt}/{MAX_RETRIES} failed")
        if attempt < MAX_RETRIES:
            time.sleep(2 * attempt)
    return []

def iso_utc(created_utc):
    """Convert a Reddit created_utc epoch into strict ISO 8601 (Z suffix)."""
    dt = datetime.fromtimestamp(float(created_utc), tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def build_text(post):
    """Combine title + selftext. Return None if the post should be skipped."""
    title = (post.get("title") or "").strip()
    body = (post.get("selftext") or "").strip()

    if title in BAD_TEXT or body in {"[removed]", "[deleted]"}:
        return None
    if post.get("author") in (None, "", "[deleted]"):
        return None
    if post.get("removed_by_category"):      # removed by mods/admins/author
        return None

    return f"{title}\n\n{body}" if body else title

def to_record(post, keyword):
    """Map a raw Reddit post and brand keyword to one CSV row."""
    text = build_text(post)
    if text is None or not post.get("created_utc"):
        return None

    external_id = post.get("id")
    if not external_id:
        return None
    return {
        "id": str(uuid.uuid4()),
        "platform": "reddit",
        "target": keyword,
        "record_type": "post",
        "external_id": external_id,
        "author_id": post["author"],
        "text": text,
        "source_url": (
            f"https://www.reddit.com{post['permalink']}"
            if post.get("permalink")
            else post.get("url", "")
        ),
        "published_at": iso_utc(post["created_utc"]),
        "metadata": json.dumps(
            {
                "score": post.get("upvotes", 0),
            },
            separators=(", ", ": "),
        ),
        "dedup_key": f"reddit|post|{external_id}",
    }

# ------------------------------- main ---------------------------------
def main():
    rows, seen = [], set()

    for i, keyword in enumerate(SEARCH_KEYWORDS):
        print(f"Searching Reddit for {keyword} ...")
        posts = fetch_search(keyword)
        kept = 0
        for post in posts:
            record = to_record(post, keyword)
            if record is None or record["dedup_key"] in seen:
                continue
            seen.add(record["dedup_key"])
            rows.append(record)
            kept += 1
        print(f"  fetched {len(posts)}, kept {kept}")
        if i < len(SEARCH_KEYWORDS) - 1:
            time.sleep(REQUEST_DELAY_SECONDS)

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nDone. Wrote {len(rows)} records to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
