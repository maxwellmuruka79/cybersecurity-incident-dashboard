// What-if attack model. It is a transparent, simplified model, NOT a measurement of real attacks.
// The detection part uses the same thresholds as the real detection rules.

export interface RuleParams {
  brute_force: { min_failures: number; window_seconds: number };
  slow_brute_force: { min_failures: number; window_seconds: number };
  distributed_attack: { min_ips: number; window_seconds: number };
}

// Used if the live thresholds cannot be loaded from the database
export const DEFAULT_RULES: RuleParams = {
  brute_force: { min_failures: 10, window_seconds: 120 },
  slow_brute_force: { min_failures: 12, window_seconds: 1800 },
  distributed_attack: { min_ips: 6, window_seconds: 300 },
};

export interface SimInputs {
  ratePerIp: number; // guesses per minute from each attacking IP
  ips: number; // how many IP addresses the attacker uses
  minutes: number; // how long the attack runs
  log10Guesses: number; // password strength: it takes about 10^x guesses to find it
  lockoutAfter: number | null; // account locks after this many failures (null = no lockout)
  mfa: boolean; // a second factor is required to sign in
}

export interface Detection {
  rule: string;
  minutes: number; // time until this rule raises its alert
}

export interface SimResult {
  attempts: number; // guesses the attacker actually gets to make
  lockoutAtMinutes: number | null; // when the lockout stops the attack
  attackEndsAtMinutes: number; // when the attack ends, by lockout or by running out of time
  detections: Detection[]; // rules that fire before the attack ends
  firstAlertMinutes: number | null;
  expectedCrackMinutes: number; // average time to guess the password with no defences
  pGuessed: number; // chance the password is guessed
  pAccess: number; // chance the attacker gets into the account
}

export function simulate(i: SimInputs, rules: RuleParams = DEFAULT_RULES): SimResult {
  const rate = Math.max(i.ratePerIp, 0.0001);
  const totalRate = rate * Math.max(i.ips, 1); // all attempts per minute

  // A lockout stops the attack once enough failures have piled up on the account
  const lockoutAt = i.lockoutAfter ? i.lockoutAfter / totalRate : null;
  const endsAt = lockoutAt !== null ? Math.min(lockoutAt, i.minutes) : i.minutes;
  const attempts = Math.min(totalRate * endsAt, i.lockoutAfter ?? Infinity);

  // Which rules would fire, and when. Per-IP rules look at ONE address at a time.
  const candidates: Detection[] = [];
  const bf = rules.brute_force;
  if (rate * (bf.window_seconds / 60) >= bf.min_failures) {
    candidates.push({ rule: "brute_force", minutes: bf.min_failures / rate });
  }
  const sb = rules.slow_brute_force;
  if (rate * (sb.window_seconds / 60) >= sb.min_failures) {
    candidates.push({ rule: "slow_brute_force", minutes: sb.min_failures / rate });
  }
  const da = rules.distributed_attack;
  // needs enough different IPs, each making at least one attempt inside the window
  if (i.ips >= da.min_ips && rate * (da.window_seconds / 60) >= 1) {
    candidates.push({ rule: "distributed_attack", minutes: da.min_ips / totalRate });
  }
  const detections = candidates.filter((d) => d.minutes <= endsAt).sort((a, b) => a.minutes - b.minutes);

  // Uniform-guess model: with N possible guesses, G attempts succeed with probability G/N
  const N = Math.pow(10, i.log10Guesses);
  const pGuessed = Math.min(1, attempts / N);

  return {
    attempts,
    lockoutAtMinutes: lockoutAt !== null && lockoutAt <= i.minutes ? lockoutAt : null,
    attackEndsAtMinutes: endsAt,
    detections,
    firstAlertMinutes: detections.length ? detections[0].minutes : null,
    expectedCrackMinutes: N / 2 / totalRate,
    pGuessed,
    pAccess: i.mfa ? 0 : pGuessed,
  };
}