#!/usr/bin/env python3
"""Backtest runner (2026-11-26). Builds neutral shuffled questions for the held-out rows (date > CUT),
runs 3 predictors x 2 option orders as fresh `claude -p --model haiku --tools ""` processes (cwd = empty dir,
no repo, no memory, no quotes, no answers), scores, writes backtest-2026-11-26.json.
Usage: run_backtest.py            (needs the `claude` CLI)"""
import json, random, subprocess, re, os, concurrent.futures as cf
CUT="2026-11-03"; SEEDS={"A":11,"B":22}
D="/home/user/edu-rpg/docs/taste/"; W="/tmp/claude-0/pt/"
rows=[json.loads(l) for l in open(D+"decisions.jsonl")]
use=[r for r in rows if r.get("usable")]
test=[r for r in use if r["date"]>CUT]; train=[r for r in use if r["date"]<=CUT]
GUIDES={"a_none":None,"b_train":open(D+"guide-train.md").read(),"c_full":open(W+"guide-full-1-4.md").read()}
def make(order):
    rng=random.Random(SEEDS[order]); qs=[]
    ids=list(range(len(test))); rng.shuffle(ids)
    perm={}
    for i in range(len(test)):
        p=list(range(len(test[i]["options"]))); rng.shuffle(p); perm[i]=p
    if order=="B":   # B = reverse of A's option order, and a different question order
        rng2=random.Random(SEEDS["A"]); ids2=list(range(len(test))); rng2.shuffle(ids2)
        for i in range(len(test)):
            p=list(range(len(test[i]["options"]))); rng2.shuffle(p); perm[i]=p[::-1]
        ids=random.Random(SEEDS["B"]).sample(range(len(test)),len(test))
    for k,i in enumerate(ids):
        qs.append(dict(qid="Q%02d"%(k+1),row=test[i]["id"],perm=perm[i],q=test[i]["question"],
                       opts=[test[i]["options"][j] for j in perm[i]]))
    return qs
def prompt(guide,qs):
    t="You are predicting the product owner's decision on look-and-feel and design questions for a children's maths quiz RPG (kids 6-8, phone, Dragon Quest style).\n"
    if guide: t+="\nUse this taste guide, distilled from the owner's earlier decisions:\n\n"+guide+"\n"
    else: t+="You have no other information about the owner.\n"
    t+="\nFor each question pick the option the owner chose. Answer ONLY with one JSON object per line: {\"qid\":\"Q01\",\"pick\":\"A\",\"confidence\":0.0-1.0}. No other text.\n\n"
    for q in qs:
        t+=q["qid"]+": "+q["q"]+"\n"+"".join("  %s) %s\n"%("ABCD"[i],o) for i,o in enumerate(q["opts"]))+"\n"
    return t
def run(name,order,qs):
    p=prompt(GUIDES[name],qs)
    out=subprocess.run(["claude","-p","--model","haiku","--tools","","--no-session-persistence"],input=p,capture_output=True,text=True,cwd=W,timeout=600).stdout
    got={}
    for m in re.finditer(r'\{[^{}]*"qid"[^{}]*\}',out):
        try: j=json.loads(m.group(0)); got[j["qid"]]=(j["pick"].strip().upper()[:1],j.get("confidence"))
        except Exception: pass
    return dict(predictor=name,order=order,raw=out,preds=got)
if __name__=="__main__":
    Q={o:make(o) for o in "AB"}
    jobs=[(n,o) for n in GUIDES for o in "AB"]
    with cf.ThreadPoolExecutor(6) as ex:
        res=list(ex.map(lambda a:run(a[0],a[1],Q[a[1]]),jobs))
    byid={r["id"]:r for r in test}; score={}
    for r in res:
        rec=[]
        for q in Q[r["order"]]:
            pk=r["preds"].get(q["qid"],(None,None))[0]
            idx=q["perm"]["ABCD".index(pk)] if pk and "ABCD".index(pk)<len(q["perm"]) else None
            rec.append(dict(row=q["row"],qid=q["qid"],pick_letter=pk,pick_option=idx,correct=(idx==byid[q["row"]]["chosen"]),conf=r["preds"].get(q["qid"],(None,None))[1]))
        r["scored"]=rec
    json.dump(dict(cut=CUT,seeds=SEEDS,n_test=len(test),n_train=len(train),model="haiku via `claude -p --tools ''` (Agent tool unavailable to worker)",
                   questions=Q,runs=res),open(D+"backtest-2026-11-26.json","w"),indent=1,ensure_ascii=False)
    for r in res: print(r["predictor"],r["order"],sum(x["correct"] for x in r["scored"]),"/",len(r["scored"]))
