import { tableCurve, levelForXp } from 'gamification-kit';

// Level L needs floor(100 x (L - 1)^1.5) XP: floor(sqrt(10000 x (L - 1)^3)) with an
// integer square root, so every runtime builds the same table.
function isqrt(n) {
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}
const thresholds = Array.from({ length: 60 }, (_, i) => Number(isqrt(10000n * BigInt(i) ** 3n)));
console.log(JSON.stringify(thresholds.slice(0, 6)));
// -> [0,100,282,519,800,1118]

const curve = tableCurve(thresholds);
console.log(levelForXp(curve, 1000).level);
// -> 5
