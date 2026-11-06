// 서버용: 맛조수 목소리를 자동으로 준비한다 (서버가 켜질 때마다 실행, 이미 준비됐으면 바로 끝남)
// 1) VoiceStudio가 켜질 때까지 기다림 (처음에는 모델 내려받기로 오래 걸림)
// 2) 상업 이용 가능한 엔진(VoxCPM2 등)이 있는지 확인
// 3) 저장소의 기준 녹음(tools/setup/matjosu-reference.wav)으로 '맛조수-지문' 목소리를 만들고,
//    아직 고른 목소리가 없을 때만 기본 목소리로 지정 (설정 화면에서 고른 다른 목소리는 그대로 둔다)
//    (클라우드 GPU는 켜질 때 같은 녹음으로 스스로 만든다 → 여기서는 이미 있음)
// 4) 새로 만들었으면 짧은 문장을 한 번 만들어 모델을 메모리에 올려 둠
import fs from 'node:fs';
import { AUDIO_DIR } from '../../apps/studio/server/pipeline.ts';
import { resetTtsDetection, synthesize, ttsProvider } from '../../apps/studio/server/tts.ts';
import {
  MASCOT_REFERENCE_FILE,
  createDesignedVoice,
  createVoiceFromReference,
  engineInfo,
  findVoiceStudio,
  listProfiles,
  mascotVoiceName,
  readVoiceSettings,
  writeVoiceSettings,
} from '../../apps/studio/server/voicestudio.ts';
import { presetByVoiceName } from '../../apps/studio/server/voicePresets.ts';

const deadline = Date.now() + 90 * 60 * 1000;
const reference = fs.existsSync(MASCOT_REFERENCE_FILE) ? fs.readFileSync(MASCOT_REFERENCE_FILE) : null;
const NAME = reference ? mascotVoiceName(reference) : '맛조수';

let vs = await findVoiceStudio();
while (vs.state !== 'ok') {
  if (Date.now() > deadline) {
    console.error('VoiceStudio가 90분 안에 준비되지 않았어요.');
    process.exit(1);
  }
  console.log(`VoiceStudio 기다리는 중… (${vs.state})`);
  await new Promise((r) => setTimeout(r, 20_000));
  vs = await findVoiceStudio();
}

const engines = await engineInfo(vs.url);
if (!engines.chosen) {
  console.error(`상업 이용 가능한 음성 엔진이 없어요 (설치된 엔진: ${engines.available.join(', ') || '없음'}).`);
  process.exit(1);
}
console.log(`음성 엔진: ${engines.chosen}`);

let created = false;
const existing = (await listProfiles(vs.url)).find((p) => p.name === NAME);
if (existing) {
  console.log(`'${NAME}' 목소리가 이미 있어요.`);
} else {
  console.log(`'${NAME}' 목소리를 만드는 중…`);
  if (reference) await createVoiceFromReference(vs.url, NAME, reference);
  else await createDesignedVoice(vs.url, NAME);
  created = true;
  console.log(`'${NAME}' 목소리를 만들었어요.`);
}
const current = readVoiceSettings().voicestudioVoice;
const keep = !!current && (presetByVoiceName(current) !== null || (await listProfiles(vs.url)).some((p) => p.name === current));
if (keep) {
  console.log(`고른 목소리 '${current}'를 그대로 써요.`);
} else {
  writeVoiceSettings({ voicestudioVoice: NAME });
  console.log(`기본 목소리를 '${NAME}'(으)로 정했어요.`);
}
resetTtsDetection();

if (created && (await ttsProvider()) === 'voicestudio') {
  const t0 = Date.now();
  const a = await synthesize('이희재의 맛 연구소, 오늘의 실험!', AUDIO_DIR);
  console.log(`시험 음성 ${a.seconds.toFixed(1)}초를 ${Math.round((Date.now() - t0) / 1000)}초 만에 만들었어요.`);
}
console.log('목소리 준비 끝.');
process.exit(0);
