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
