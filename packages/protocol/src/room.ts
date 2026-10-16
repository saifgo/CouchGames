/** Room codes: 4 letters, no I/O/L/U/V to avoid misreads ("V" vs "U", "O" vs "0", rude words less likely). */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ';
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return s;
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return null;
  return code;
}
