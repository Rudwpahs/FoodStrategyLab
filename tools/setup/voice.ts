// 서버용: 맛조수 목소리를 자동으로 준비한다 (오라클 설치 후 한 번, 실패하면 systemd가 다시 실행)
// 1) VoiceStudio가 켜질 때까지 기다림 (처음에는 모델 내려받기로 오래 걸림)
// 2) 상업 이용 가능한 엔진(VoxCPM2 등)이 있는지 확인
// 3) '맛조수' 목소리가 없으면 만들고, 스튜디오 기본 목소리로 지정
// 4) 짧은 문장을 한 번 만들어 모델을 메모리에 올려 둠 (첫 영상이 덜 기다리게)
import { AUDIO_DIR } from '../../apps/studio/server/pipeline.ts';
import { resetTtsDetection, synthesize, ttsProvider } from '../../apps/studio/server/tts.ts';
import { createDesignedVoice, engineInfo, findVoiceStudio, listProfiles, writeVoiceSettings } from '../../apps/studio/server/voicestudio.ts';

const NAME = '맛조수';
const deadline = Date.now() + 90 * 60 * 1000;

let vs = await findVoiceStudio();
while (vs.state !== 'ok') {
  if (Date.now() > deadline) {
    console.error('VoiceStudio가 90분 안에 준비되지 않았어요. "journalctl -u matlab-voicestudio" 로그를 확인하세요.');
    process.exit(1);
  }
  console.log(`VoiceStudio 기다리는 중… (${vs.state})`);
  await new Promise((r) => setTimeout(r, 20_000));
  vs = await findVoiceStudio();
}

const engines = await engineInfo(vs.url);
if (!engines.chosen) {
  console.error(`상업 이용 가능한 음성 엔진이 없어요 (설치된 엔진: ${engines.available.join(', ') || '없음'}). 설치 스크립트를 다시 실행하세요.`);
  process.exit(1);
}
console.log(`음성 엔진: ${engines.chosen}`);

const existing = (await listProfiles(vs.url)).find((p) => p.name === NAME);
if (existing) {
  console.log(`'${NAME}' 목소리가 이미 있어요.`);
} else {
  console.log(`'${NAME}' 목소리를 만드는 중… (CPU 서버에서 수 분 걸려요)`);
  await createDesignedVoice(vs.url, NAME);
  console.log(`'${NAME}' 목소리를 만들었어요.`);
}
writeVoiceSettings({ voicestudioVoice: NAME });
resetTtsDetection();

if ((await ttsProvider()) === 'voicestudio') {
  const t0 = Date.now();
  const a = await synthesize('이희재의 맛 연구소, 오늘의 실험!', AUDIO_DIR);
  console.log(`시험 음성 ${a.seconds.toFixed(1)}초를 ${Math.round((Date.now() - t0) / 1000)}초 만에 만들었어요. 목소리 준비 끝.`);
}
process.exit(0);
