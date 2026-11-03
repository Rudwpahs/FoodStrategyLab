"""Compare Whisper word timestamps of a rendered video with the studio timeline."""
import json, sys, difflib, re
from faster_whisper import WhisperModel

video, timeline_path = sys.argv[1], sys.argv[2]
tl = json.load(open(timeline_path))
model = WhisperModel('small', device='cpu', compute_type='int8')
segs, _ = model.transcribe(video, language='ko', word_timestamps=True, vad_filter=False)
words = [w for s in segs for w in s.words]
norm = lambda t: re.sub(r'[^0-9A-Za-z가-힣]', '', t)

print('voiced', tl['voiced'])
in_caption = total = 0
for sc in tl['scenes']:
    heard = [w for w in words if sc['start'] - 0.2 <= (w.start + w.end) / 2 < sc['end']]
    text = ''.join(norm(w.word) for w in heard)
    ratio = difflib.SequenceMatcher(None, text, norm(sc['line'])).ratio()
    offset = (heard[0].start - sc['groups'][0]['from']) if heard and sc['groups'] else None
    print(f"{sc['id']:>10} match={ratio:.2f} words={len(heard)} start_offset={offset if offset is None else round(offset, 2)}")
    for w in heard:
        mid = (w.start + w.end) / 2
        g = next((g for g in sc['groups'] if g['from'] <= mid < g['to'] + 0.15), None)
        total += 1
        if g and difflib.SequenceMatcher(None, norm(w.word), norm(g['text'])).find_longest_match().size >= max(1, len(norm(w.word)) // 2):
            in_caption += 1
print(f'caption agreement {in_caption}/{total} = {in_caption / max(1, total):.0%}')
