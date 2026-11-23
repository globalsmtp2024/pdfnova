import argparse
import json
import os
import sys
from typing import Any, Optional

from pdfnova.client import DEFAULT_BASE_URL, Client, PDFNovaError


def parse_option(text: str) -> tuple[str, Any]:
    key, separator, raw = text.partition("=")
    if not separator or not key:
        raise argparse.ArgumentTypeError("Options look like name=value")
    try:
        return key, json.loads(raw)
    except ValueError:
        return key, raw


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pdfnova", description="Run PDFNova tools from the terminal.")
    parser.add_argument("--api-key", default=os.environ.get("PDFNOVA_API_KEY"), help="defaults to $PDFNOVA_API_KEY")
    parser.add_argument("--base-url", default=os.environ.get("PDFNOVA_BASE_URL", DEFAULT_BASE_URL))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("tools", help="list available tools")
    run = commands.add_parser("run", help="run a tool on files")
    run.add_argument("tool")
    run.add_argument("files", nargs="+")
    run.add_argument("-o", "--output", default=".", help="folder for results")
    run.add_argument("-O", "--option", action="append", default=[], type=parse_option, metavar="NAME=VALUE")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.api_key:
        print("Set PDFNOVA_API_KEY or pass --api-key.", file=sys.stderr)
        return 2
    try:
        with Client(args.api_key, args.base_url) as client:
            if args.command == "tools":
                for tool in client.tools():
                    print(f"{tool['slug']:28} {tool['summary']}")
                return 0
            results = client.run(args.tool, args.files, dict(args.option), args.output)
            for path in results:
                print(path)
            return 0
    except PDFNovaError as error:
        print(f"Error: {error}" + (f" ({error.hint})" if error.hint else ""), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
