#!/usr/bin/env python3
"""Audit #[tauri::command] parameter ordering.

Canonical order: (State?, id/scalar*, data-struct?, options-struct?).

A command is "conformant" if, after collapsing consecutive same tokens, the
classification string is a subsequence of "sido":
    s = State<...>
    i = primitive / Option / Vec / PathBuf / *Id
    d = other owned struct (payload / complex data)
    o = struct whose type name ends in Options / Config / Payload / Params

Usage:
    audit-command-order.py                 # report
    audit-command-order.py --update-json   # also patch watermarks.local.json

Exit 0 on success.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CMD_DIR = REPO_ROOT / "src-tauri" / "src" / "commands"

ATTR_RE = re.compile(r"#\[tauri::command\]")
FN_RE = re.compile(r"fn\s+([A-Za-z0-9_]+)\s*\(", re.MULTILINE)

PRIMITIVE_PREFIXES = (
    "String", "&str", "bool",
    "usize", "u8", "u16", "u32", "u64", "u128",
    "isize", "i8", "i16", "i32", "i64", "i128",
    "f32", "f64",
    "Option<", "Vec<", "PathBuf",
)


def split_top_level_commas(s: str) -> list[str]:
    out: list[str] = []
    depth = 0
    cur: list[str] = []
    for ch in s:
        if ch == "<":
            depth += 1
            cur.append(ch)
        elif ch == ">":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    tail = "".join(cur).strip()
    if tail:
        out.append(tail)
    return out


def extract_commands(source: str, path: Path) -> list[tuple[str, str, list[str]]]:
    """Yield (fn_name, param_types_joined, type_list) for each tauri::command fn."""
    results: list[tuple[str, str, list[str]]] = []
    for attr_match in ATTR_RE.finditer(source):
        # Find the `fn NAME(` after this attribute.
        fn_match = FN_RE.search(source, attr_match.end())
        if not fn_match:
            continue
        fn_name = fn_match.group(1)
        # Read params from opening paren to matching closing paren.
        open_idx = fn_match.end() - 1  # position of '('
        depth = 0
        close_idx = -1
        for i in range(open_idx, len(source)):
            c = source[i]
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    close_idx = i
                    break
        if close_idx == -1:
            continue
        raw = source[open_idx + 1 : close_idx]
        # Strip comments.
        raw = re.sub(r"//[^\n]*", "", raw)
        raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.DOTALL)
        params = split_top_level_commas(raw)
        types: list[str] = []
        for p in params:
            if not p:
                continue
            # "name: Type" or "_: Type"
            if ":" in p:
                ty = p.split(":", 1)[1].strip()
            else:
                ty = p.strip()
            types.append(ty)
        results.append((fn_name, ", ".join(types), types))
    return results


def classify(ty: str) -> str:
    if "State<" in ty:
        return "s"
    if re.search(r"(Options|Config|Payload|Params)(<|$|\s)", ty):
        return "o"
    # strip leading &, mut, lifetimes
    bare = re.sub(r"^[&\s]*(mut\s+)?('\w+\s+)?", "", ty)
    if bare.startswith(PRIMITIVE_PREFIXES) or re.match(r"[A-Z][A-Za-z0-9_]*Id\b", bare):
        return "i"
    return "d"


def is_conformant(seq: str) -> bool:
    # Collapse runs.
    collapsed = []
    for ch in seq:
        if not collapsed or collapsed[-1] != ch:
            collapsed.append(ch)
    collapsed_str = "".join(collapsed)
    canonical = "sido"
    p = 0
    for ch in collapsed_str:
        found = False
        while p < len(canonical):
            if canonical[p] == ch:
                p += 1
                found = True
                break
            p += 1
        if not found:
            return False
    return True


def main() -> int:
    update_json = "--update-json" in sys.argv[1:]

    if not CMD_DIR.is_dir():
        print(f"error: {CMD_DIR} not found", file=sys.stderr)
        return 1

    total = 0
    conformant = 0
    lines: list[str] = []

    for path in sorted(CMD_DIR.glob("*.rs")):
        source = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO_ROOT)
        for fn_name, _types_str, types in extract_commands(source, path):
            seq = "".join(classify(t) for t in types)
            total += 1
            ok = is_conformant(seq) if seq else True
            if ok:
                conformant += 1
                tag = "OK "
            else:
                tag = "BAD"
            lines.append(f"{tag} {rel}::{fn_name}  [{seq}]")

    for ln in lines:
        print(ln)

    if total == 0:
        print("\nNo #[tauri::command] attributes found.")
        return 0

    pct = (conformant / total) * 100.0
    print("\n────────────────────────────────")
    print(f"Total commands scanned : {total}")
    print(f"Conformant             : {conformant}")
    print(f"Non-conformant         : {total - conformant}")
    print(f"Coverage               : {pct:.1f}%")
    print("────────────────────────────────")

    if update_json:
        wm = REPO_ROOT / "watermarks.local.json"
        if not wm.is_file():
            print("watermarks.local.json not found; skipping --update-json.", file=sys.stderr)
            return 0
        data = json.loads(wm.read_text(encoding="utf-8"))
        today = _dt.datetime.utcnow().strftime("%Y-%m-%d")
        for entry in data.get("watermarks", []):
            if entry.get("type") == "structural":
                entry["baseline_coverage_pct"] = round(pct, 1)
                entry["baseline_date"] = today
        wm.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Patched {wm.name} → coverage={pct:.1f}%  date={today}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
