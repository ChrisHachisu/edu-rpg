import sys
from compose import *
from grade import grade
from layouts import TOWNS
for t in sys.argv[1:]:
    r = compose(TOWNS[t]); g = grade(r, TOWNS[t])
    Image.fromarray(g.astype(np.uint8)).resize((975, 975), Image.LANCZOS).save(SCRATCH + '/look/%s-gh.png' % t)
