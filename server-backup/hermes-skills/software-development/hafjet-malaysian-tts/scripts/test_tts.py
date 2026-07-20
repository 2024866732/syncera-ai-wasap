import os, re, torch
torch.cuda.is_available = lambda: False
os.environ['CUDA_VISIBLE_DEVICES'] = ''

import soundfile as sf
from distilcodec import DistilCodec
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = os.path.expanduser('~/tts')
MODEL_DIR = os.path.join(BASE, 'Malaysian-TTS-0.6B-v1')
CODEC_CFG = os.path.join(BASE, 'DistilCodec-v1.0', 'model_config.json')
CODEC_CKPT = os.path.join(BASE, 'DistilCodec-v1.0', 'g_00204000')
EOS_ID = 151643  # <|endoftext|>

print('loading codec (cpu)...', flush=True)
codec = DistilCodec.from_pretrained(
    config_path=CODEC_CFG, model_path=CODEC_CKPT,
    use_generator=True, is_debug=False).eval().to('cpu')
print('loading tts model (cpu)...', flush=True)
tok = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR, torch_dtype='auto').to('cpu')
print('model loaded', flush=True)

def generate_speech(speaker, text, max_new_tokens=900):
    left = f'{speaker}: {text}'
    prompt = f'<|im_start|>{left}<|speech_start|>'
    inp = tok(prompt, return_tensors='pt', add_special_tokens=False).to('cpu')
    # greedy + early stop at EOS (most reliable for Qwen TTS; sampled overruns)
    out = model.generate(**inp, max_new_tokens=max_new_tokens,
                         do_sample=False, repetition_penalty=1.1,
                         eos_token_id=EOS_ID)
    seq = out[0].tolist()
    if EOS_ID in seq:
        seq = seq[:seq.index(EOS_ID)]
        print(f'  [eos stopped at {len(seq)} tokens]', flush=True)
    else:
        print(f'  [no eos, capped at {len(seq)}]', flush=True)
    dec = tok.decode(seq)
    sp = dec.split('<|speech_start|>')[-1]
    return list(map(int, re.findall(r'speech_(\d+)', sp)))

# normalized text required (model trained on normalized text)
string = 'Selamat datang ke HAFJET. Ada apa yang boleh saya bantu hari ini?'

for s in ['idayu', 'husein']:
    nums = generate_speech(s, string)
    y = codec.decode_from_codes(nums, minus_token_offset=False)
    fn = os.path.join(BASE, f'test_{s}.mp3')
    sf.write(fn, y[0, 0].cpu().numpy(), 24000)
    print('WROTE', fn, 'codes=', len(nums), flush=True)

print('TEST_DONE')
