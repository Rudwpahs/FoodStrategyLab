"""VibeVoice-Realtime-0.5B (Microsoft, MIT) 음성 엔진 — 실험용.

- 한국어는 Microsoft가 '실험용'으로 낸 기본 목소리 2개(여성·남성)만 쓸 수 있다. 목소리 복제는 안 된다.
- Microsoft는 "연구·개발용, 상업 서비스에는 추가 시험 없이 쓰지 말 것"을 권한다 → 스튜디오에서는 기본이 아니라 '실험'으로만 고른다.
- 같은 코드를 세 곳에서 쓴다: 로컬 시험(python engine.py), 로컬 서버(serve), 클라우드 GPU(deploy/modal/app.py).

목소리 파일(.pt)은 고정한 커밋의 공식 저장소 파일만 쓰고, 불러오기 전에 지문(sha256)을 확인한다.
(최신 PyTorch는 이 파일 형식을 안전 모드로 못 읽어서 일반 모드로 읽는데, 지문이 다르면 읽지 않는다)
"""

from __future__ import annotations

import copy
import hashlib
import io
import json
import os
import subprocess
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_ID = "microsoft/VibeVoice-Realtime-0.5B"
# 시험한 VibeVoice 저장소 커밋 (2026-10-08)
REPO_COMMIT = "16fb2cb1217c9934a886e1948ffb06120caa2df5"
SAMPLE_RATE = 24000

# 스튜디오에서 고를 수 있는 목소리 → (파일 이름, 지문)
SPEAKERS = {
    "kr-woman": ("kr-Spk0_woman.pt", "c6d15b8d66f8c271655d000b5923cb33a9b564bf84484a82b10431dc1a2fafef"),
    "kr-man": ("kr-Spk1_man.pt", "65514854c7ffc7080aba964cf40811822358b19397132ddaf9b3cdb168c394f3"),
}
SPEAKER_LABELS = {"kr-woman": "한국어 여성 (실험)", "kr-man": "한국어 남성 (실험)"}


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_text(text: str) -> str:
    """모델이 못 읽는 기호를 정리한다 (따옴표 통일, 줄바꿈 → 띄어쓰기)."""
    t = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return " ".join(t.split())


def wav_bytes(samples) -> bytes:
    """float(-1~1) 배열 → 16비트 WAV"""
    import numpy as np

    pcm = (np.clip(np.asarray(samples, dtype=np.float32).reshape(-1), -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def to_mp3(wav: bytes) -> bytes:
    """스튜디오는 MP3를 쓴다 (ffmpeg 필요)"""
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-codec:a", "libmp3lame", "-q:a", "3", "-f", "mp3", "pipe:1"],
        input=wav,
        capture_output=True,
        check=True,
    )
    return p.stdout


class Engine:
    def __init__(self, voices_dir: str, device: str | None = None):
        import torch
        from vibevoice.modular.modeling_vibevoice_streaming_inference import VibeVoiceStreamingForConditionalGenerationInference
        from vibevoice.processor.vibevoice_streaming_processor import VibeVoiceStreamingProcessor

        self.torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        dtype = torch.bfloat16 if self.device == "cuda" else torch.float32
        self.processor = VibeVoiceStreamingProcessor.from_pretrained(MODEL_ID)
        self.model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
            MODEL_ID, torch_dtype=dtype, device_map=self.device, attn_implementation="sdpa"
        )
        self.model.eval()
        self.model.set_ddpm_inference_steps(num_steps=5)
        self.prompts = {}
        for key, (name, digest) in SPEAKERS.items():
            path = os.path.join(voices_dir, name)
            actual = _sha256(path)
            if actual != digest:
                raise RuntimeError(f"목소리 파일 지문이 달라요: {name} ({actual[:12]}…)")
            self.prompts[key] = torch.load(path, map_location=self.device, weights_only=False)
        self.lock = threading.Lock()

    def speak(self, text: str, speaker: str = "kr-woman") -> tuple[bytes, float, float]:
        """대사 → (WAV, 길이 초, 만드는 데 걸린 초)"""
        if speaker not in self.prompts:
            raise ValueError(f"모르는 목소리: {speaker}")
        prompt = self.prompts[speaker]
        inputs = self.processor.process_input_with_cached_prompt(
            text=clean_text(text), cached_prompt=prompt, padding=True, return_tensors="pt", return_attention_mask=True
        )
        for k, v in inputs.items():
            if self.torch.is_tensor(v):
                inputs[k] = v.to(self.device)
        with self.lock, self.torch.inference_mode():
            t = time.time()
            out = self.model.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=1.5,
                tokenizer=self.processor.tokenizer,
                generation_config={"do_sample": False},
                verbose=False,
                all_prefilled_outputs=copy.deepcopy(prompt),
            )
            took = time.time() - t
        audio = out.speech_outputs[0].float().cpu().numpy()
        return wav_bytes(audio), audio.shape[-1] / SAMPLE_RATE, took


def serve(engine: Engine, port: int, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    """스튜디오용 작은 HTTP 서버: GET /health, POST /tts {text, speaker} → MP3"""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_a):
            pass

        def _send(self, status: int, ctype: str, body: bytes) -> None:
            self.send_response(status)
            self.send_header("content-type", ctype)
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, "application/json", json.dumps({"status": "ok", "model": MODEL_ID}).encode())
            self._send(404, "text/plain", b"not found")

        def do_POST(self):
            if self.path != "/tts":
                return self._send(404, "text/plain", b"not found")
            try:
                data = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
                wav, _sec, _took = engine.speak(str(data.get("text", ""))[:600], str(data.get("speaker", "kr-woman")))
                self._send(200, "audio/mpeg", to_mp3(wav))
            except Exception as e:  # 스튜디오가 쉬운 문장으로 보여 준다
                self._send(500, "application/json", json.dumps({"detail": str(e)}, ensure_ascii=False).encode())

    server = ThreadingHTTPServer((host, port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


if __name__ == "__main__":
    # 시험: python engine.py <VibeVoice 저장소의 demo/voices/streaming_model> <lines.json> <출력 폴더>
    # 서버: python engine.py <목소리 폴더> --serve 3910
    voices = sys.argv[1]
    eng = Engine(voices)
    if sys.argv[2] == "--serve":
        serve(eng, int(sys.argv[3]))
        print(f"VibeVoice 서버: http://127.0.0.1:{sys.argv[3]}", flush=True)
        threading.Event().wait()
    lines = json.load(open(sys.argv[2], encoding="utf-8"))
    out_dir = sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    report = []
    for speaker in SPEAKERS:
        for i, line in enumerate(lines, 1):
            wav, sec, took = eng.speak(line, speaker)
            with open(os.path.join(out_dir, f"vibevoice-{speaker}-{i}.wav"), "wb") as f:
                f.write(wav)
            report.append({"speaker": speaker, "line": i, "seconds": round(sec, 2), "took": round(took, 1)})
            print(speaker, i, f"{sec:.1f}초 음성을 {took:.1f}초에 만듦", flush=True)
    with open(os.path.join(out_dir, "vibevoice-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
