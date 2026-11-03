"""Quick look: render the given towns (default all) at 650 px into one sheet for iteration."""
import sys
from multiprocessing import Pool
from compose import *
from grade import grade
from layouts import TOWNS


def one(t):
    r = compose(dict(TOWNS[t])); g = grade(r, dict(TOWNS[t]))
    Image.fromarray(g.astype(np.uint8)).save(SCRATCH + '/look/%s-full.png' % t)
    return t


if __name__ == "__main__":
    ids = sys.argv[1:] or list(TOWNS)
    with Pool(min(len(ids), 5)) as p:
        p.map(one, ids)
    n = len(ids); cols = 3 if n > 4 else n; rows = (n + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 650, rows * 650))
    for i, t in enumerate(ids):
        sheet.paste(Image.open(SCRATCH + '/look/%s-full.png' % t).resize((650, 650), Image.LANCZOS), ((i % cols) * 650, (i // cols) * 650))
    sheet.save(SCRATCH + '/look/all.png')
