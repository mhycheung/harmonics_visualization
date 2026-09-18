// Spin-weighted spherical harmonics sY_lm(theta, phi).
//
// Goldberg et al., J. Math. Phys. 8, 2155 (1967), in the sign convention used by
// LALSuite (XLALSpinWeightedSphericalHarmonic) and the SXS catalog:
//
//   sY_lm = (-1)^m sqrt[ (l+m)!(l-m)!(2l+1) / (4 pi (l+s)!(l-s)!) ]
//           * sum_r C(l-s, r) C(l+s, r+s-m) (-1)^(l-r-s)
//             * sin^(2l-k)(theta/2) cos^k(theta/2) e^(i m phi),   k = 2r+s-m.
//
// This is the usual sin^(2l)(theta/2) cot^k(theta/2) form, rewritten so that no
// negative power appears (0 <= k <= 2l for every nonzero term), so it is finite
// at both poles. Examples: -2Y_22 = sqrt(5/(64 pi)) (1+cos theta)^2 e^(2 i phi);
// 0Y_11 = -sqrt(3/(8 pi)) sin theta e^(i phi) (Condon-Shortley phase included).

const LF = [0];
for (let n = 1; n <= 40; n++) LF[n] = LF[n - 1] + Math.log(n);
const logBinom = (n, k) => LF[n] - LF[k] - LF[n - k];

// Returns f(theta, phi) -> [re, im]. Throws for an invalid (s, l, m).
export function makeSYlm(s, l, m) {
  if (!(Number.isInteger(s) && Number.isInteger(l) && Number.isInteger(m)))
    throw new Error(`non-integer (s,l,m)=(${s},${l},${m})`);
  if (l < Math.abs(s) || Math.abs(m) > l)
    throw new Error(`invalid (s,l,m)=(${s},${l},${m})`);
  const logPre = 0.5 * (LF[l + m] + LF[l - m] + Math.log(2 * l + 1)
                        - Math.log(4 * Math.PI) - LF[l + s] - LF[l - s]);
  const terms = [];                                     // [coefficient, k]
  for (let r = 0; r <= l - s; r++) {
    const j = r + s - m;
    if (j < 0 || j > l + s) continue;
    const sign = ((m + l - r - s) % 2 === 0) ? 1 : -1;  // (-1)^m (-1)^(l-r-s)
    terms.push([sign * Math.exp(logPre + logBinom(l - s, r) + logBinom(l + s, j)),
                2 * r + s - m]);
  }
  return (theta, phi) => {
    const sh = Math.sin(theta / 2), ch = Math.cos(theta / 2);
    let v = 0;
    for (const [c, k] of terms) v += c * Math.pow(sh, 2 * l - k) * Math.pow(ch, k);
    return [v * Math.cos(m * phi), v * Math.sin(m * phi)];
  };
}

// Orientation of the glyph that represents the spin-s value f at a point, measured
// from e_theta toward e_phi.  A vector v = v_th e_th + v_ph e_ph has spin +1
// component (v_th + i v_ph) and spin -1 component (v_th - i v_ph); a symmetric
// traceless tensor with stretch axis at angle psi has spin -2 component
// h = h+ - i hx = |h| e^(-2 i psi).  In general  chi = sign(s) arg(f) / |s|.
export function glyphAngle(s, re, im) {
  return Math.sign(s) * Math.atan2(im, re) / Math.abs(s);
}
