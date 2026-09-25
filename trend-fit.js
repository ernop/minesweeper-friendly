'use strict';

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Select the exact median pairwise slope through dual-line intersections.
// Sampling narrows the search interval; inversion counts certify which
// interval contains the requested rank. It never estimates the answer.
// Expected O(n log n) time and O(n) space, instead of storing/sorting all
// n(n-1)/2 slopes. Parallel pairs are excluded; even medians average both
// central slopes. The intercept retains median(y - b*x).
function fitTheilSen(pairs, random = Math.random) {
  const n = pairs.length;
  const ids = Array.from({ length: n }, (_, i) => i);
  let exactX = null, exactY = null;

  // Doubles are dyadic rationals. A common binary scale lets ambiguous
  // intersections be ordered exactly, including coincident/parallel lines.
  function scaledIntegers(values) {
    const buffer = new DataView(new ArrayBuffer(8));
    let minExponent = Infinity;
    const parts = values.map((value) => {
      buffer.setFloat64(0, value);
      const bits = buffer.getBigUint64(0);
      const exponentBits = Number((bits >> 52n) & 2047n);
      let mantissa = bits & ((1n << 52n) - 1n);
      if (exponentBits !== 0) mantissa |= 1n << 52n;
      if (bits >> 63n) mantissa = -mantissa;
      const exponent = exponentBits === 0 ? -1074 : exponentBits - 1075;
      if (mantissa !== 0n) minExponent = Math.min(minExponent, exponent);
      return { mantissa, exponent };
    });
    return parts.map(({ mantissa, exponent }) => mantissa === 0n ? 0n
      : mantissa << BigInt(exponent - minExponent));
  }

  function slopePair(i, j) {
    if (pairs[i][0] > pairs[j][0]) [i, j] = [j, i];
    return { i, j, dx: pairs[j][0] - pairs[i][0], dy: pairs[j][1] - pairs[i][1] };
  }

  function determinantSign(a, b) {
    const left = a.dy * b.dx, right = b.dy * a.dx;
    const difference = left - right;
    const errorBound = 16 * Number.EPSILON * (Math.abs(left) + Math.abs(right));
    if (Number.isFinite(difference) && errorBound > 0 && Math.abs(difference) > errorBound) return Math.sign(difference);
    if (exactX === null) {
      exactX = scaledIntegers(pairs.map((p) => p[0]));
      exactY = scaledIntegers(pairs.map((p) => p[1]));
    }
    const exact = (exactY[a.j] - exactY[a.i]) * (exactX[b.j] - exactX[b.i])
      - (exactY[b.j] - exactY[b.i]) * (exactX[a.j] - exactX[a.i]);
    return exact < 0n ? -1 : exact > 0n ? 1 : 0;
  }

  function orderAt(pivot, after) {
    return ids.slice().sort((i, j) => {
      const dx = pairs[i][0] - pairs[j][0];
      if (dx === 0) return pairs[j][1] - pairs[i][1] || i - j;
      const order = determinantSign(slopePair(i, j), pivot);
      return Math.sign(dx) * (order === 0 ? (after ? 1 : -1) : -order);
    });
  }
  const initial = ids.slice().sort((i, j) => pairs[j][0] - pairs[i][0]
    || pairs[j][1] - pairs[i][1] || i - j);
  const last = ids.slice().sort((i, j) => pairs[i][0] - pairs[j][0]
    || pairs[j][1] - pairs[i][1] || i - j);

  // A merge's right-before-left block represents every crossing in that
  // block. Count or sample its ranks without visiting all of its pairs.
  function crossings(from, to, count = null, sampleSize = 0) {
    const rank = new Int32Array(n);
    for (let i = 0; i < n; i++) rank[to[i]] = i;
    let source = from.slice(), target = new Array(n), total = 0, next = 0;
    const chosen = count === null ? [] : Array.from({ length: sampleSize },
      () => Math.floor(random() * count)).sort((a, b) => a - b);
    const values = [];
    for (let width = 1; width < n; width *= 2) {
      for (let lo = 0; lo < n; lo += 2 * width) {
        const mid = Math.min(lo + width, n), hi = Math.min(lo + 2 * width, n);
        let i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
          if (rank[source[i]] < rank[source[j]]) target[k++] = source[i++];
          else {
            const amount = mid - i;
            if (count !== null) {
              if (sampleSize === 0) {
                for (let a = i; a < mid; a++) values.push(slopePair(source[a], source[j]));
              } else {
                while (next < chosen.length && chosen[next] < total + amount) {
                  values.push(slopePair(source[i + chosen[next] - total], source[j]));
                  next++;
                }
              }
            }
            total += amount;
            target[k++] = source[j++];
          }
        }
        while (i < mid) target[k++] = source[i++];
        while (j < hi) target[k++] = source[j++];
      }
      [source, target] = [target, source];
    }
    return { count: total, values };
  }
  const total = crossings(initial, last).count;
  if (total === 0) return null;

  function select(targetRank) {
    let lower = initial, upper = last, below = 0, count = total;
    while (count > 2 * n) {
      const sample = crossings(lower, upper, count, n).values.sort(determinantSign);
      const center = (targetRank - below) * n / count;
      const margin = Math.ceil(Math.sqrt(n));
      const pivots = [sample[Math.max(0, Math.floor(center) - margin)],
        sample[Math.min(n - 1, Math.ceil(center) + margin)]];
      const previousCount = count;
      let above = below + count;
      for (const pivot of pivots) {
        const before = orderAt(pivot, false), after = orderAt(pivot, true);
        const less = crossings(initial, before).count;
        const through = crossings(initial, after).count;
        if (less <= targetRank && targetRank < through) return pivot.dy / pivot.dx;
        if (through <= targetRank && through > below) { lower = after; below = through; }
        if (less > targetRank && less < above) { upper = before; above = less; }
      }
      count = above - below;
      if (count >= previousCount || count <= 0) throw new Error('Theil–Sen slope interval did not contract');
    }
    const values = crossings(lower, upper, count).values.sort(determinantSign);
    const selected = values[targetRank - below];
    return selected.dy / selected.dx;
  }
  const high = Math.floor(total / 2);
  const b = total % 2 ? select(high) : (select(high - 1) + select(high)) / 2;
  return { a: median(pairs.map(([x, y]) => y - b * x)), b };
}


function fitTrendLines(pairs, todayPairs) {
  const lines = [];
  for (const [data, cls] of [[pairs, 'trend-all'], [todayPairs, 'trend-today']]) {
    const fit = fitTheilSen(data);
    if (!fit) continue;
    let xMin = Infinity, xMax = -Infinity;
    for (const [x] of data) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); }
    lines.push({ ...fit, cls, xMin, xMax });
  }
  return lines;
}
