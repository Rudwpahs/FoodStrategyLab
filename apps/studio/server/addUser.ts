// 계정 만들기·비밀번호 바꾸기 (스튜디오 PC에서 실행)
//   npm run user:add -- <아이디> <표시 이름>     예: npm run user:add -- heejae 이희재
//   npm run user:add -- <아이디> --reset        비밀번호 바꾸기 (그 계정의 로그인은 모두 끊김)
import path from 'node:path';
import readline from 'node:readline';
import { Auth } from './auth.ts';
import { DATA_DIR, DB_FILE } from './config.ts';
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

const [username, nameOrFlag] = process.argv.slice(2);
if (!username) {
  console.log('사용법: npm run user:add -- <아이디> <표시 이름>   (비밀번호 바꾸기: --reset)');
  process.exit(1);
}
const auth = new Auth(openDb(DB_FILE));
const pw = await askHidden('비밀번호 (10자 이상): ');
const again = await askHidden('비밀번호 한 번 더: ');
if (pw !== again) {
  console.log('두 비밀번호가 달라요. 다시 실행해 주세요.');
  process.exit(1);
}
try {
  if (nameOrFlag === '--reset') {
    auth.setPassword(username, pw);
    console.log(`"${username}" 비밀번호를 바꿨어요.`);
  } else {
    const u = auth.addUser(username, nameOrFlag ?? username, pw);
    console.log(`계정을 만들었어요: ${u.username} (${u.displayName}). 이제 다른 기기에서 로그인할 수 있어요.`);
  }
} catch (e) {
  console.log(`실패: ${(e as Error).message}`);
  process.exit(1);
}
