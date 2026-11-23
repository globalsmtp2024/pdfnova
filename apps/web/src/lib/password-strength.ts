export type StrengthLevel = "empty" | "veryWeak" | "weak" | "fair" | "strong" | "veryStrong";

export type StrengthHint = "tooShort" | "common" | "repetitive" | "addClasses";

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  level: StrengthLevel;
  hints: StrengthHint[];
};

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 127;

const COMMON_PASSWORDS = new Set([
  "123456",
  "123456789",
  "12345678",
  "1234567890",
  "12345",
  "1234567",
  "111111",
  "000000",
  "123123",
  "654321",
  "666666",
  "121212",
  "112233",
  "password",
  "password1",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1q2w3e4r",
  "1qaz2wsx",
  "abc123",
  "abcdef",
  "abcd1234",
  "iloveyou",
  "admin",
  "admin123",
  "administrator",
  "welcome",
  "welcome1",
  "letmein",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "cricket",
  "pakistan",
  "pakistan123",
  "karachi",
  "lahore",
  "master",
  "sunshine",
  "princess",
  "shadow",
  "superman",
  "batman",
  "trustno1",
  "secret",
  "changeme",
  "default",
  "login",
  "starwars",
  "freedom",
  "whatever",
  "hello123",
  "test123",
  "computer",
  "internet",
]);

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#$%&*+-=?@^_~";

function characterClasses(password: string) {
  return {
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

function poolSize(password: string): number {
  const classes = characterClasses(password);
  return (
    (classes.lower ? 26 : 0) +
    (classes.upper ? 26 : 0) +
    (classes.digit ? 10 : 0) +
    (classes.symbol ? 33 : 0)
  );
}

function isCommon(password: string): boolean {
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered)) return true;
  const stripped = lowered.replace(/[0-9!@#$%^&*._-]+$/, "");
  return stripped.length > 0 && stripped.length < lowered.length && COMMON_PASSWORDS.has(stripped);
}

function isRepetitive(password: string): boolean {
  return new Set(password).size <= Math.max(2, Math.floor(password.length / 4));
}

const LEVELS: StrengthLevel[] = ["veryWeak", "weak", "fair", "strong", "veryStrong"];

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, level: "empty", hints: [] };
  const hints: StrengthHint[] = [];
  const classCount = Object.values(characterClasses(password)).filter(Boolean).length;
  const bits = [...password].length * Math.log2(Math.max(poolSize(password), 1));
  let score: number = bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    hints.push("tooShort");
    score = Math.min(score, 1);
  }
  if (isCommon(password)) {
    hints.push("common");
    score = 0;
  }
  if (isRepetitive(password)) {
    hints.push("repetitive");
    score = Math.min(score, 1);
  }
  if (classCount === 1) score = Math.min(score, 2);
  if (classCount < 3 && score < 4) hints.push("addClasses");
  const bounded = Math.max(0, Math.min(4, score)) as PasswordStrength["score"];
  return { score: bounded, level: LEVELS[bounded], hints };
}

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

function randomIndex(limit: number, random: (buffer: Uint32Array) => Uint32Array): number {
  const ceiling = Math.floor(0x1_0000_0000 / limit) * limit;
  const buffer = new Uint32Array(1);
  for (;;) {
    random(buffer);
    if (buffer[0] < ceiling) return buffer[0] % limit;
  }
}

export function generatePassword(
  length = 20,
  random: (buffer: Uint32Array) => Uint32Array = (buffer) => crypto.getRandomValues(buffer),
): string {
  const groups = [LOWER, UPPER, DIGITS, SYMBOLS];
  const all = groups.join("");
  const size = Math.max(length, groups.length);
  const characters = groups.map((group) => group[randomIndex(group.length, random)]);
  while (characters.length < size) characters.push(all[randomIndex(all.length, random)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1, random);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join("");
}
