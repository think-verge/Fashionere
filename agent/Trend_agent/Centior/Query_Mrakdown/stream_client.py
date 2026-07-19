"""
Live client for the /query/stream endpoint — watch answers stream in real time.

Run the API first (from this folder):
    ..\\venv\\Scripts\\python.exe -m uvicorn api:app --reload --port 8000

Then either:
    ..\\venv\\Scripts\\python.exe stream_client.py                          # interactive
    ..\\venv\\Scripts\\python.exe stream_client.py rising color trends      # one-shot
"""

import argparse
import json
import sys

import requests

DEFAULT_URL = "http://127.0.0.1:8000/query/stream"
RULE = "-" * 72


def stream_query(url: str, query: str, show_trends: bool = True) -> None:
    payload = {"query": query}

    with requests.post(url, json=payload, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        resp.encoding = "utf-8"
        # chunk_size=1 so each NDJSON line is shown the moment the server sends it,
        # instead of being buffered by requests.
        for raw in resp.iter_lines(chunk_size=1, decode_unicode=True):
            if not raw:
                continue
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "meta":
                print(f"parsed_filter : {json.dumps(event['parsed_filter'], ensure_ascii=False)}")
                print(f"filter_used   : {json.dumps(event['filter_used'], ensure_ascii=False)}")
                print(f"matched {event['total_matched']} | returned {event['trend_count']} "
                      f"| broadened: {event['broadened']}")
                if show_trends:
                    labels = ", ".join(t.get("label", "?") for t in event["trends"])
                    print(f"trends        : {labels}")
                print(RULE)
            elif kind == "delta":
                print(event["text"], end="", flush=True)
            elif kind == "done":
                print(f"\n{RULE}")
            elif kind == "error":
                print(f"\n[server error] {event.get('detail')}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Stream answers from the trend query API.")
    parser.add_argument("query", nargs="*", help="one-shot question; omit for interactive mode")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"endpoint URL (default {DEFAULT_URL})")
    parser.add_argument("--no-trends", action="store_true", help="hide the retrieved trend labels")
    args = parser.parse_args()

    if args.query:
        stream_query(args.url, " ".join(args.query), show_trends=not args.no_trends)
        return

    print("Interactive mode — type a question, empty line or Ctrl+C to quit.")
    while True:
        try:
            q = input("\nquery> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not q:
            break
        try:
            stream_query(args.url, q, show_trends=not args.no_trends)
        except requests.RequestException as exc:
            print(f"[request failed] {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
