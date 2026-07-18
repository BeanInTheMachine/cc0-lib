#!/usr/bin/env python3
"""
cc0-lib Moderation Assistant — fetches pending items, downloads assets,
checks file integrity, and prepares a structured report for Hermes Agent review.

Usage:
    python scripts/review-pending.py              # dry-run: report only
    python scripts/review-pending.py --commit     # commit approvals/rejections
    python scripts/review-pending.py --approve --id <ID>
    python scripts/review-pending.py --reject --id <ID>

Env vars (for --commit actions):
    GITHUB_TOKEN    GitHub PAT with repo contents write scope
    GITHUB_OWNER    Default: BeanInTheMachine
    GITHUB_REPO     Default: cc0-lib
"""

import argparse
import json
import os
import struct
import sys
import tempfile
import urllib.request
from urllib.error import HTTPError
from pathlib import Path
from typing import Any, Optional

# ── Config ──────────────────────────────────────────────────────────────
GITHUB_RAW = "https://raw.githubusercontent.com"
GITHUB_API = "https://api.github.com"
METADATA_PATH = "src/data/metadata.json"
DEFAULT_OWNER = "BeanInTheMachine"
DEFAULT_REPO = "cc0-lib"
BRANCH = "main"
DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "cc0lib-review"
# ─────────────────────────────────────────────────────────────────────────

# Magic byte signatures for validation
MAGIC_SIGS: dict[str, bytes] = {
    "PNG": b"\x89PNG\r\n\x1a\n",
    "JPG": b"\xff\xd8\xff",
    "JPEG": b"\xff\xd8\xff",
    "GIF": b"GIF8",
    "WEBP": b"RIFF",
    "MP4": b"\x00\x00\x00\x00ftyp",
    "WEBM": b"\x1a\x45\xdf\xa3",
    "GLB": b"glTF",
    "ZIP": b"PK\x03\x04",
    "PDF": b"%PDF",
    "SVG": b"<svg",
    "MP3": b"ID3",
    "WAV": b"RIFF",
}


def check_magic_bytes(path: Path, declared_filetype: str) -> Optional[str]:
    """Check if file magic bytes match the declared filetype. Returns None if OK, error string if not."""
    try:
        with open(path, "rb") as f:
            header = f.read(16)
    except Exception as e:
        return f"Can't read file: {e}"

    # Try the exact declared type first, then lowercase
    for ft in [declared_filetype.upper(), declared_filetype.lower()]:
        sig = MAGIC_SIGS.get(ft)
        if sig and header.startswith(sig):
            return None  # matches

    # For WEBP (RIFF + WEBP)
    if declared_filetype.upper() == "WEBP" and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return None

    # For unknown/unsupported filetypes, skip magic check
    return None  # can't verify, pass through


def fetch_metadata() -> list[dict[str, Any]]:
    """Fetch metadata.json from GitHub raw."""
    url = f"{GITHUB_RAW}/{DEFAULT_OWNER}/{DEFAULT_REPO}/{BRANCH}/{METADATA_PATH}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"ERROR: Failed to fetch metadata.json: {e}", file=sys.stderr)
        sys.exit(1)


def download_asset(url: str, item_id: str, filetype: str) -> Optional[Path]:
    """Download an Arweave asset to temp dir. Returns path or None."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = filetype.lower() if filetype else "bin"
    dest = DOWNLOAD_DIR / f"{item_id}.{ext}"
    if dest.exists():
        return dest  # already downloaded
    try:
        urllib.request.urlretrieve(url, dest)
        return dest
    except Exception:
        return None


def get_pending_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return items pending moderation review."""
    return [i for i in items if i.get("SubmissionStatus") == "submitted"]


def gh_api_write(path: str, method: str = "GET", body: Optional[dict] = None) -> dict:
    """Call GitHub API with auth."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("ERROR: GITHUB_TOKEN env var required for write operations", file=sys.stderr)
        sys.exit(1)
    url = f"{GITHUB_API}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    data = json.dumps(body).encode("utf-8") if body else None
    if body:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        print(f"ERROR: GitHub API {method} {path} failed: {e.code} {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def commit_updates(items: list[dict[str, Any]], commit_msg: str) -> None:
    """Commit updated metadata.json to GitHub using Git Data API."""
    owner = os.environ.get("GITHUB_OWNER", DEFAULT_OWNER)
    repo = os.environ.get("GITHUB_REPO", DEFAULT_REPO)
    base = f"/repos/{owner}/{repo}"

    # Get latest commit SHA
    ref = gh_api_write(f"{base}/git/ref/heads/{BRANCH}")
    base_sha = ref["object"]["sha"]

    # Get commit + tree SHA
    commit = gh_api_write(f"{base}/git/commits/{base_sha}")
    base_tree_sha = commit["tree"]["sha"]

    # Get current metadata.json blob
    file_meta = gh_api_write(f"{base}/contents/{METADATA_PATH}?ref={base_sha}")
    current_blob = gh_api_write(f"{base}/git/blobs/{file_meta['sha']}")
    current_content = bytes(current_blob["content"], "utf-8") if current_blob["encoding"] == "utf-8" else __import__("base64").b64decode(current_blob["content"])

    # Parse, merge updates, serialize
    existing = json.loads(current_content.decode("utf-8"))

    # Create lookup by ID
    existing_by_id = {i.get("id"): i for i in existing}
    for item in items:
        item_id = item.get("id")
        if item_id in existing_by_id:
            existing_by_id[item_id].update(item)

    new_content = json.dumps(existing, indent=2, ensure_ascii=False)

    # Create blob
    blob_resp = gh_api_write(f"{base}/git/blobs", "POST", {
        "content": new_content,
        "encoding": "utf-8",
    })

    # Create tree
    tree_resp = gh_api_write(f"{base}/git/trees", "POST", {
        "base_tree": base_tree_sha,
        "tree": [{"path": METADATA_PATH, "mode": "100644", "type": "blob", "sha": blob_resp["sha"]}],
    })

    # Create commit
    commit_resp = gh_api_write(f"{base}/git/commits", "POST", {
        "message": commit_msg,
        "tree": tree_resp["sha"],
        "parents": [base_sha],
    })

    # Update ref
    gh_api_write(f"{base}/git/refs/heads/{BRANCH}", "PATCH", {
        "sha": commit_resp["sha"],
        "force": False,
    })

    print(f"✓ Committed: {commit_resp['sha'][:8]} — {commit_msg}")


def report(items: list[dict]) -> list[dict]:
    """Download assets and produce review report. Returns report entries."""
    report_entries = []
    for item in items:
        entry = {
            "id": item.get("id"),
            "title": item.get("Title"),
            "ens": item.get("ENS", ""),
            "type": item.get("Type"),
            "filetype": item.get("Filetype"),
            "arweave_url": item.get("ThumbnailURL") or item.get("File", ""),
            "tags": item.get("Tags", []),
            "description": item.get("Description", ""),
            "local_path": None,
            "magic_check": None,
        }

        # Download asset
        asset_url = item.get("ThumbnailURL") or item.get("File")
        if asset_url:
            path = download_asset(asset_url, item.get("id", "unknown"), item.get("Filetype", ""))
            if path:
                entry["local_path"] = str(path)
                entry["magic_check"] = check_magic_bytes(path, item.get("Filetype", ""))

        report_entries.append(entry)

    return report_entries


def main():
    parser = argparse.ArgumentParser(description="cc0-lib Moderation Assistant")
    parser.add_argument("--commit", action="store_true", help="Commit changes back to GitHub")
    parser.add_argument("--approve", action="store_true", help="Approve specific items (requires --id)")
    parser.add_argument("--reject", action="store_true", help="Reject specific items (requires --id)")
    parser.add_argument("--id", nargs="+", help="Item ID(s) to approve/reject")
    parser.add_argument("--report-only", action="store_true", help="Only generate report, no downloads")
    args = parser.parse_args()

    # Fetch metadata
    items = fetch_metadata()
    pending = get_pending_items(items)

    if not pending:
        print("No items pending review. All clear!")
        return

    print(f"Found {len(pending)} item(s) pending review:\n")

    # Report mode
    if args.report_only:
        for item in pending:
            print(f"  [{item.get('id')}] {item.get('Title')}")
            print(f"       Type: {item.get('Type')} · Format: {item.get('Filetype')}")
            print(f"       ENS: {item.get('ENS', 'none')}")
            print(f"       URL: {item.get('ThumbnailURL') or item.get('File', '')}")
            print()
        return

    # Download and check
    entries = report(pending)

    for entry in entries:
        status = "✓" if entry["magic_check"] is None else "⚠"
        print(f"  {status} [{entry['id'][:12]}...] {entry['title']}")
        print(f"       Type: {entry['type']} · Format: {entry['filetype']} · ENS: {entry['ens'] or 'none'}")
        if entry["local_path"]:
            print(f"       Download: {entry['local_path']}")
        if entry["magic_check"]:
            print(f"       ⚠ Magic byte issue: {entry['magic_check']}")
        print()

    # Commit actions
    if args.approve and args.id:
        updates = []
        for item in pending:
            if item.get("id") in args.id:
                item["SubmissionStatus"] = "approved"
                updates.append(item)
        if updates and args.commit:
            msg = f"mod: approved {len(updates)} item(s) — {', '.join(u.get('Title', '?') for u in updates)}"
            commit_updates(pending, msg)
        elif updates:
            titles = ", ".join(u.get("Title", "?") for u in updates)
            print(f"DRY-RUN: Would approve: {titles}")

    if args.reject and args.id:
        updates = []
        for item in pending:
            if item.get("id") in args.id:
                item["SubmissionStatus"] = "rejected"
                updates.append(item)
        if updates and args.commit:
            msg = f"mod: rejected {len(updates)} item(s) — {', '.join(u.get('Title', '?') for u in updates)}"
            commit_updates(pending, msg)
        elif updates:
            titles = ", ".join(u.get("Title", "?") for u in updates)
            print(f"DRY-RUN: Would reject: {titles}")

    if not args.approve and not args.reject:
        print(f"Use --approve --id <ID> or --reject --id <ID> to moderate items.")
        print(f"Add --commit to write decisions to GitHub.")


if __name__ == "__main__":
    main()
