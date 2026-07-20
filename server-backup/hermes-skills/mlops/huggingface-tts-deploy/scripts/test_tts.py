import os, re
import torch
torch.cuda.is_available = lambda: False   # belt-and-suspenders
os.environ['CUDA_VISIBLE_DEVICES'] = ''

import soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = os.path.expanduser('~/tts')
MODEL_DIR = os.path.join(BASE, 'Malaysian-TTS-0.6B-v1')
CODEC_CFG = os.path.join(BASE, 'DistilCodec-v1.0', 'model_config.json')
CODEC_CKPT = os.path.join(BASE, 'DistilCodec-v1.0', 'g_00204000')

print('loading codec (cpu)...', flush=True)
codec = DistilCodec.from_pretrained(
    config_path=CODEC_CFG, model_path=CODEC_CKPT,
    use_generator=True, is_debug=False).eval().to('cpu')

print('loading tts model (cpu)...', flush=True)
tok = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, torch_dtype='auto').to('cpu')
print('model loaded', flush=True)

# text MUST be normalized (model trained on normalized text)
string = 'Selamat datang ke HAFJET. Ada apa yang boleh saya bantu hari ini?'

for s in ['idayu', 'husein']:
    left = s + ': ' + string
    prompt = f'<|im_start|>{left}<|speech_start|>'
    out = model.generate(
        **tok(prompt, return_tensors='pt', add_special_tokens=False).to('cpu'),
        max_new_tokens=1024, temperature=0.7, do_sample=True,
        repetition_penalty=1.1)
    sp = tok.decode(out[0]).split('<|speech_start|>')[-1].replace('<|endoftext|>', '')
    nums = list(map(int, re.findall(r'speech_(\d+)', sp)))
    y = codec.decode_from_codes(nums, minus_token_offset=False)
    fn = os.path.join(BASE, f'test_{s}.mp3')
    sf.write(fn, y[0, 0].cpu().numpy(), 24000)
    print('WROTE', fn, 'tokens=', len(nums), flush=True)

print('TEST_DONE')
