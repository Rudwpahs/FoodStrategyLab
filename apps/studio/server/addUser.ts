// 계정 만들기·비밀번호 바꾸기·연구자 계정 정하기 (스튜디오 PC에서 실행)
//   npm run user:add -- <아이디> <표시 이름>                예: npm run user:add -- heejae 이희재
//   npm run user:add -- <아이디> <표시 이름> --researcher   연구자 계정으로 만들기 (승인은 연구자 계정만 할 수 있다)
//   npm run user:add -- <아이디> --researcher               이미 있는 계정을 연구자 계정으로 정하기 (비밀번호는 묻지 않음)
//   npm run user:add -- <아이디> --reset                    비밀번호 바꾸기 (그 계정의 로그인은 모두 끊김)
// 클라우드(화면에서 첫 계정 만들기)에서는 첫 계정을 만들 때 '연구자 계정' 표시를 고르면 된다.
import readline from 'node:readline';
import { Auth } from './auth.ts';
import { DB_FILE } from './config.ts';
import { openDb } from './db.ts';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    out._writeToOutput = (s: string) => {
      if (!asked) {
        out.output.write(s);
        asked = true;
      } else if (s.includes('\n')) out.output.write('\n');
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const args = process.argv.slice(2);
const researcher = args.includes('--researcher');
const reset = args.includes('--reset');
const [username, displayName] = args.filter((a) => !a.startsWith('--'));
if (!username) {
  console.log('사용법: npm run user:add -- <아이디> <표시 이름> [--researcher]   (비밀번호 바꾸기: --reset, 연구자 계정으로 정하기: <아이디> --researcher)');
  process.exit(1);
}
const db = openDb(DB_FILE);
const auth = new Auth(db);
const exists = Boolean(db.prepare('SELECT 1 FROM users WHERE username = ?').get(username));
try {
  if (researcher && exists && !displayName && !reset) {
    auth.setRole(username, 'researcher');
    console.log(`"${username}" 계정을 연구자 계정으로 정했어요. 이제 승인은 연구자 계정만 할 수 있어요.`);
    process.exit(0);
  }
  const pw = await askHidden('비밀번호 (10자 이상): ');
  const again = await askHidden('비밀번호 한 번 더: ');
  if (pw !== again) {
    console.log('두 비밀번호가 달라요. 다시 실행해 주세요.');
    process.exit(1);
  }
  if (reset) {
    auth.setPassword(username, pw);
    console.log(`"${username}" 비밀번호를 바꿨어요.`);
  } else {
    const u = auth.addUser(username, displayName ?? username, pw, researcher ? 'researcher' : 'member');
    console.log(`계정을 만들었어요: ${u.username} (${u.displayName}${u.role === 'researcher' ? ', 연구자 계정' : ''}). 이제 다른 기기에서 로그인할 수 있어요.`);
  }
} catch (e) {
  console.log(`실패: ${(e as Error).message}`);
  process.exit(1);
}
