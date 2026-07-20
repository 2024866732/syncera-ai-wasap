import sys
# Idempotent CPU patch for DistilCodec on the GPU-less PC Office.
# Run with the tts venv active:  python /tmp/distilcodec_cpu_patch.py
p = '/home/hafizi145/tts_venv/lib/python3.11/site-packages/distilcodec/distil_codec.py'
src = open(p).read()

# 1) from_pretrained hardcodes cuda device
old1 = "codec.device = torch.device('cuda:{:d}'.format(local_rank))"
new1 = "codec.device = torch.device('cpu')  # patched for CPU-only PC Office"
if old1 in src:
    src = src.replace(old1, new1)
    print('patched from_pretrained device')
else:
    print('from_pretrained already patched (or line changed)')

# 2) decode_from_codes hardcodes .cuda() at the end of a chained unsqueeze
old2 = ".unsqueeze(-1).cuda()"
new2 = ".unsqueeze(-1).cpu()"
assert old2 in src, "TARGET .cuda() LINE NOT FOUND in decode_from_codes"
src = src.replace(old2, new2)
print('patched decode_from_codes .cuda()->.cpu()')

open(p, 'w').write(src)
print('ALL_PATCHED')
