'use strict';

// Versioned deterministic random stream for complete game replay. A stored
// seed is meaningful only together with this version name.

const GAME_RNG_VERSION = 'xoshiro128ss-v1';

function gameRotateLeft32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function createGameSeed() {
  const words = new Uint32Array(4);
  crypto.getRandomValues(words);
  // xoshiro's sole invalid state is all-zero. Canonicalize that one draw
  // before serializing so every stored seed names a working stream.
  if (words.every((word) => word === 0)) words[3] = 1;
  return [...words].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function randomFromGameSeed(seed) {
  if (!/^[0-9a-f]{32}$/.test(seed)) throw new Error('invalid game seed');
  const state = [];
  for (let i = 0; i < 4; i++) {
    state.push(Number.parseInt(seed.slice(i * 8, i * 8 + 8), 16));
  }
  if (state.every((word) => word === 0)) throw new Error('all-zero game seed');

  return () => {
    const result = Math.imul(
      gameRotateLeft32(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
    const shifted = (state[1] << 9) >>> 0;
    state[2] = (state[2] ^ state[0]) >>> 0;
    state[3] = (state[3] ^ state[1]) >>> 0;
    state[1] = (state[1] ^ state[2]) >>> 0;
    state[0] = (state[0] ^ state[3]) >>> 0;
    state[2] = (state[2] ^ shifted) >>> 0;
    state[3] = gameRotateLeft32(state[3], 11);
    return result / 0x100000000;
  };
}

const GameRandom = {
  VERSION: GAME_RNG_VERSION,
  createSeed: createGameSeed,
  fromSeed: randomFromGameSeed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = GameRandom;
