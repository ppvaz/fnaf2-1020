/**
 * Compile-time shapes for the versioned core contracts.
 * Runtime validation lives beside these types in contracts/index.js.
 */
export type ClockName =
  | 'game-frame'
  | 'simulator-frame'
  | 'device-monotonic-ms'
  | 'host-monotonic-ms'
  | 'audio-sample';

export interface ClockRef {
  readonly clock: ClockName;
  readonly value: number;
}

export type SemanticControl =
  | 'mask' | 'monitor' | 'light' | 'wind' | 'ventL' | 'ventR'
  | `cam:${number}`;

export type ControlKind = 'press' | 'release' | 'hold' | 'select';

export interface ControlCommand {
  readonly schema: 'control-command-v1';
  readonly id: string;
  readonly action: { readonly kind: ControlKind; readonly control: SemanticControl };
  readonly requestedAt: ClockRef;
  readonly deadline?: ClockRef;
  readonly source: { readonly controller: string; readonly policyHash?: string };
}

export interface Measurement<T = unknown> {
  readonly schema: 'measurement-v1';
  readonly id: string;
  readonly signal: string;
  readonly state: 'OBSERVED' | 'UNKNOWN';
  readonly value?: T;
  readonly reason?: string;
  readonly confidence: number;
  readonly observedAt: ClockRef;
  readonly receivedAt: ClockRef;
  readonly validUntil?: ClockRef;
  readonly source: Record<string, string | null>;
}

export type ActuationStatus =
  | 'REQUESTED' | 'SENT' | 'ACCEPTED' | 'VERIFIED'
  | 'REJECTED' | 'FAILED' | 'UNKNOWN';

export interface ActuationResult {
  readonly schema: 'actuation-result-v1';
  readonly commandId: string;
  readonly status: ActuationStatus;
  readonly backend: string;
  readonly sentAt?: ClockRef;
  readonly verifiedAt?: ClockRef | null;
  readonly uncertaintyMs: number;
  readonly reason?: string;
}

export interface CapabilityDescriptor {
  readonly schema: 'capability-v1';
  readonly adapter: string;
  readonly actions: readonly ControlKind[];
  readonly controls: readonly string[];
  readonly clock: ClockName;
  readonly verification: 'none' | 'external' | 'internal';
  readonly claimLevel: 'MODEL_ONLY' | 'FIXTURE' | 'DEVICE_MEASURED';
  readonly limitations: readonly string[];
}

export interface DeviceProfile {
  readonly schema: 'device-profile-v1';
  readonly id: string;
  readonly targetBuild: string;
  readonly actuator: string;
  readonly visualSensor: string;
  readonly visualDetector: string;
  readonly clock: ClockName;
  readonly calibrations: Record<string, string>;
}

export type BenchTracePath = 'visual' | 'audio';

export interface BenchTraceStage {
  readonly atMs: number;
  readonly [key: string]: unknown;
}

export interface BenchTraceSample {
  readonly id: string;
  readonly path: BenchTracePath;
  readonly sourceEvent: BenchTraceStage;
  readonly fact: BenchTraceStage;
  readonly executorReceipt: BenchTraceStage;
  readonly actuatorCommand: BenchTraceStage;
  readonly observedResult: BenchTraceStage;
}

export interface BenchTransportTrace {
  readonly schema: 'bench-transport-trace-v1';
  readonly id: string;
  readonly profile: string;
  readonly clock: 'device-monotonic-ms' | 'host-monotonic-ms';
  readonly claimLevel: 'MODEL_ONLY' | 'FIXTURE' | 'DEVICE_MEASURED';
  readonly samples: readonly BenchTraceSample[];
  readonly continuation: Record<string, unknown>;
}

export type ExerciseKind = 'prediction' | 'recognition' | 'timing' | 'strategy';
export type ExerciseDisposition = 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'UNRESOLVED';

export interface Exercise {
  readonly schema: 'exercise-v1';
  readonly id: string;
  readonly kind: ExerciseKind;
  readonly sourceSessionId: string;
  readonly beliefSequence: number;
  readonly clock: 'host-monotonic-ms' | 'device-monotonic-ms';
  readonly createdAtMs: number;
  readonly promptAtMs: number;
  readonly commitDeadlineMs: number;
  readonly revealDeadlineMs: number;
  readonly eligibility: Record<string, unknown>;
  readonly question: { readonly target: string; readonly choices: readonly string[]; readonly horizonMs: number };
  readonly commitment: Record<string, unknown> | null;
  readonly resolution: Record<string, unknown> | 'CENSORED';
  readonly cancellation: Record<string, unknown> | null;
  readonly disposition: ExerciseDisposition;
}

export interface ExerciseAttempt {
  readonly schema: 'exercise-attempt-v1';
  readonly exerciseId: string;
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly sessionId: string;
  readonly clock: 'host-monotonic-ms' | 'device-monotonic-ms';
  readonly shownAtMs: number;
  readonly commitment: Record<string, unknown> | null;
  readonly resolutionDisposition: ExerciseDisposition;
  readonly motor: Record<string, unknown> | null;
  readonly score: Record<string, number> | null;
}

export interface ActivityGateProfile {
  readonly schema: 'activity-gate-profile-v1';
  readonly id: string;
  readonly version: string;
  readonly profileLimit: number;
  readonly timing: {
    readonly promptMs: number;
    readonly revealMs: number;
    readonly cancelP99Ms: number;
    readonly humanRecoveryBudgetMs: number;
  };
  readonly requiredCapabilities: readonly ('overlay' | 'capture' | 'response')[];
}
