#!/usr/bin/env python3
"""Lift the SHIPPED dungeon generator `Ap()` (and the helpers it needs) out of the preserved
bundle into a standalone node module, so the game's real floor layouts can be produced headlessly
with the game's own seeds. Nothing is rewritten: functions/consts are copied verbatim; missing
top-level identifiers are found by running node and adding each ReferenceError's definition.

    extract_bundle_generator.py  -> <scratch>/bundle-gen/apgen.js
"""
import os, re, subprocess, sys
import common
B = os.path.join(common.ROOT, "runtime/baselines/v1.17.1-ipad-hud-walk/assets/index-BhoGQRaA.js")
OUT = os.path.join(common.SCRATCH, "bundle-gen")
src = open(B, encoding="utf-8").read()


def block_from(start):
    """Text from `start` to the end of the statement whose first `{`/`[`/`(` group closes."""
    if src.startswith("function ", start):
        start_body = src.index("{", src.index(")", start))
        i = start_body; depth = 0
        while True:
            c = src[i]
            if c == "{": depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return src[start:i + 1]
            i += 1
    i = start; depth = 0; seen = False; q = None
    while i < len(src):
        c = src[i]
        if q:
            if c == "\\": i += 2; continue
            if c == q: q = None
        elif c in "\"'`": q = c
        elif c in "{[(": depth += 1; seen = True
        elif c in "}])":
            depth -= 1
            if seen and depth == 0:
                j = i + 1
                if src[start:start + 9] == "function ":
                    return src[start:j]
                # const X = ...; continue to the statement end at depth 0
                while j < len(src) and src[j] not in ";\n":
                    j += 1
                return src[start:j]
        elif c in ";\n" and seen and depth == 0:
            return src[start:i]
        i += 1


def definition(name):
    for pat in (r"\nfunction %s\(" % re.escape(name),
                r"\n(?:const|let|var) %s\s*=" % re.escape(name)):
        m = re.search(pat, src)
        if m:
            txt = block_from(m.start() + 1)
            if txt.startswith(("const", "let", "var")):
                txt = "var " + txt.split(" ", 1)[1]
            return txt
    # comma-declared top-level const:  const A = 1,\n    NAME = ...
    m = re.search(r"\n {0,4}%s = " % re.escape(name), src)
    if m:
        return "var " + block_from(m.start() + 1).strip().rstrip(",")
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = {"Ap": definition("Ap")}
    for k in ("Js", "Cs", "Mr"):
        parts[k] = definition(k)
    driver = """
const fs=require('fs'); console.log=()=>{}; console.warn=()=>{};
const [,,id,ch,floor,total,castle,mech,multi]=process.argv;
const r=Ap(100,100,ch.charCodeAt(0)*251,+floor,+total,false,multi==='1',castle==='1',mech==='-'?undefined:mech,id);
process.stdout.write(JSON.stringify(r));
"""
    for _ in range(80):
        js = "\n".join(parts.values()) + "\nmodule.exports={Ap};\n" + driver
        p = os.path.join(OUT, "apgen.js")
        open(p, "w").write(js)
        r = subprocess.run(["node", p, "ironMine", "i", "1", "4", "0", "-", "0"],
                           capture_output=True, text=True)
        m = re.search(r"ReferenceError: (\S+) is not defined", r.stderr)
        if not m:
            print("ok" if r.returncode == 0 else r.stderr[-1500:])
            return
        n = m.group(1)
        d = definition(n)
        if not d:
            sys.exit(f"cannot find definition of {n}")
        parts[n] = d
        print("added", n, len(d))
    sys.exit("too many iterations")


if __name__ == "__main__":
    main()
