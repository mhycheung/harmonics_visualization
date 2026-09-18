// Polar (even-parity) and axial (odd-parity) parts of a spin -2 strain.
//
// The strain is h = h+ - i hx = sum_lm h_lm -2Y_lm. A real transverse-traceless tensor
// on the sphere splits uniquely into a polar part, built from a real scalar S as
// E_AB = (D_A D_B - 1/2 g_AB D^2) S, and an axial part, built from a real scalar S' as
// its epsilon dual B_AB = 1/2 (eps_A^C E_CB + eps_B^C E_CA), eps_(theta phi) = +1 in the
// orthonormal (e_theta, e_phi) frame. In terms of the h_lm this split is
//
//   h^P_lm = (h_lm + (-1)^m conj(h_{l,-m})) / 2,   h^P_{l,-m} =  (-1)^m conj(h^P_lm)
//   h^A_lm = (h_lm - (-1)^m conj(h_{l,-m})) / 2,   h^A_{l,-m} = -(-1)^m conj(h^A_lm)
//
// with h = h^P + h^A. The check work/2026-09-18-axial-polar-tab/verify/scripts/
// check_parity.mjs verifies h^P = (2/K) E[Re Phi] and h^A = (2/K) B[Im Phi],
// Phi = sum h_lm Y_lm, K = sqrt((l+2)!/(l-2)!), by finite differences of the scalar Y_lm.
//
// The input h_lm are those of the "sYlm" tab at s = -2:
//   h_lm = e^{-iwt},   h_{l,-m} = beta e^{-iwt} + gamma e^{+iwt}   (beta, gamma real).
// "m, -m separate" is beta = gamma = 0. For m = 0 the two terms land on the same Y_l0.
//
// parityCoeffs returns the real coefficients of e^{-iwt} and e^{+iwt} that multiply
// -2Y_lm and -2Y_{l,-m}. p = +1 polar, -1 axial, 0 both (polar + axial = the input).
export function parityCoeffs(m, p, beta, gamma) {
  const sm = (m % 2 === 0) ? 1 : -1;                         // (-1)^m
  if (p === 0) return { m: [1, 0], mm: [beta, gamma] };
  return {
    m:  [0.5 * (1 + p * sm * gamma), 0.5 * p * sm * beta],    // [e^{-iwt}, e^{+iwt}] of Y_{l,m}
    mm: [0.5 * beta, 0.5 * (gamma + p * sm)],                 // [e^{-iwt}, e^{+iwt}] of Y_{l,-m}
  };
}
