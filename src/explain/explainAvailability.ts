import type { ReasonCode } from './reasonCodes';
import { mapReasonsToCodes } from './reasonCodes';
import { validateInput, validateOutput, type ExplainOutput } from './validation';

const DEFAULT_TIMEOUT_MS = 3000;

export interface ExplainResult {
  explanation: string;
  isFallback: boolean;
}

export type ExplainAdapter = (input: {
  roomLabel: string;
  startTime: string;
  endTime: string;
  reasonCodes: ReasonCode[];
}) => Promise<ExplainOutput>;

interface ExplainParams {
  roomLabel: string;
  startTime: string;
  endTime: string;
  /** The checker's own decision + reasons — used to build a deterministic fallback. */
  decision: string;
  reasons: readonly string[];
  adapter?: ExplainAdapter;
  timeoutMs?: number;
}

/**
 * Orchestrator: validate input -> call adapter (with a 3s timeout) ->
 * validate output -> return explanation.
 * On timeout, error, or invalid output, returns a deterministic fallback
 * built from the checker's own `reasons`, flagged as fallback.
 */
export async function explainAvailability(
  params: ExplainParams,
): Promise<ExplainResult> {
  const reasonCodes = mapReasonsToCodes(params.reasons);
  const input = {
    roomLabel: params.roomLabel,
    startTime: params.startTime,
    endTime: params.endTime,
    reasonCodes,
  };

  const inputCheck = validateInput(input);
  if (!inputCheck.ok || inputCheck.value === null) {
    return { explanation: fallback(params), isFallback: true };
  }

  const adapter = params.adapter ?? defaultAdapter;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await withTimeout(adapter(inputCheck.value), timeoutMs);
    const outputCheck = validateOutput(result);
    if (!outputCheck.ok || outputCheck.value === null) {
      return { explanation: fallback(params), isFallback: true };
    }
    return { explanation: outputCheck.value.explanation, isFallback: false };
  } catch {
    return { explanation: fallback(params), isFallback: true };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Explain adapter timed out after ${ms} ms.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Deterministic fallback built only from the checker's own reasons. */
function fallback(params: ExplainParams): string {
  if (params.decision === 'available' || params.reasons.length === 0) {
    return `${params.roomLabel} is available for ${params.startTime}–${params.endTime}. No conflicts were detected.`;
  }
  const first = params.reasons[0];
  return `${params.roomLabel} is unavailable: ${first}`;
}

/** Default no-op adapter used when none is supplied (pure mock). */
const defaultAdapter: ExplainAdapter = async (input) => {
  if (input.reasonCodes.length === 0) {
    return {
      explanation: `${input.roomLabel} is free from ${input.startTime} to ${input.endTime}. No conflicts were found.`,
    };
  }
  const first = input.reasonCodes[0];
  return {
    explanation: `${input.roomLabel} is unavailable for ${input.startTime}–${input.endTime} due to ${first.toLowerCase().replace(/_/g, ' ')}.`,
  };
};
