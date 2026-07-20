import sys
p = ('/home/hafizi145/tts_venv/lib/python3.11/site-packages/'
     'distilcodec/distil_codec.py')
if len(sys.argv) > 1:
    p = sys.argv[1]
src = open(p).read()
old = "codec.device = torch.device('cuda:{:d}'.format(local_rank))"
new = "codec.device = torch.device('cpu')  # patched for CPU-only worker"
assert old in src, "TARGET LINE NOT FOUND in " + p
open(p, 'w').write(src.replace(old, new))
print('PATCHED', p)
