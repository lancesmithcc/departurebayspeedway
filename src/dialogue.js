import lines from './dialogue-lines.js';
export { lines as DIALOGUE_LINES };
export const PERSON_VOICES = ['male','female','male','female','male','female','female','male'];
export function voiceHash(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function dialogueBank(event, speaker = {}) {
  if (speaker.persona) return `${speaker.persona}_${event}`;
  const group = speaker.driver ? 'driver' : speaker.party ? (speaker.hell ? 'hell' : 'church') : speaker.kid ? 'kid' : 'street';
  return `${group}_${event}`;
}
export function selectDialogue(event, speaker = {}, previous = new Map(), random = Math.random) {
  const bank = dialogueBank(event, speaker);
  const gender = speaker.voiceGender === 'female' ? 'female' : 'male';
  const choices = lines.filter(line => line.bank === bank && line.gender === gender);
  if (!choices.length) return null;
  const id = `${bank}:${gender}`;
  const eligible = choices.filter(line => line.key !== previous.get(id));
  const line = eligible[Math.floor(random() * eligible.length)] || choices[0];
  previous.set(id, line.key);
  const h = voiceHash(speaker.voiceId ?? `${speaker.variant ?? 0}:${speaker.slot ?? 0}`);
  // Small stable character offset and a much smaller per-take offset. Gender is
  // determined by the authored voice pool, never by pitch-shifting the other pool.
  const semitones = ((h % 101) / 100 - 0.5) * 2.4 + (random() - 0.5) * 0.3;
  return {...line, pitch: (speaker.kid && speaker.party ? 1.16 : 1) * 2 ** (semitones / 12), rate: 0.99 + ((h >>> 8) % 5) * 0.007};
}
