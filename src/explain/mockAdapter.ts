import type { ExplainInput, ExplainOutput } from './validation';
import type { ReasonCode } from './reasonCodes';

export interface MockAdapterOptions {
  /** Simulated processing delay in ms before resolving. */
  delayMs?: number;
  /** Force the adapter to reject after this many ms (simulates a failure). */
  failAfterMs?: number;
  /** Force the adapter to reject immediately with this error message. */
  throwError?: string;
  /** Force the adapter to resolve with this exact output (used to test invalid output). */
  forceOutput?: unknown;
}

/**
 * MOCK adapter only. Builds a short explanation from a template per reason
 * code, using only the supplied facts. Never calls any real service.
 */
export function createMockAdapter(
  options: MockAdapterOptions = {},
): (input: ExplainInput) => Promise<ExplainOutput> {
  return async (input: ExplainInput): Promise<ExplainOutput> => {
    if (options.throwError !== undefined) {
      throw new Error(options.throwError);
    }

    const delay = options.delayMs ?? 0;
    if (delay > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }

    if (options.failAfterMs !== undefined) {
      throw new Error(`Mock adapter simulated failure after ${options.failAfterMs} ms.`);
    }

    if (options.forceOutput !== undefined) {
      return options.forceOutput as ExplainOutput;
    }

    return { explanation: buildExplanation(input) };
  };
}

function buildExplanation(input: ExplainInput): string {
  const { roomLabel, startTime, endTime, reasonCodes } = input;

  if (reasonCodes.length === 0) {
    return `${roomLabel} is free from ${startTime} to ${endTime}. No conflicts were found.`;
  }

  const parts = reasonCodes.map((code) => templateFor(code, input));
  const first = parts[0];
  if (parts.length === 1) {
    return `${roomLabel} is unavailable for ${startTime}–${endTime}. ${first}`;
  }
  return `${roomLabel} is unavailable for ${startTime}–${endTime}. ${first} Also ${parts[1].toLowerCase()}`;
}

function templateFor(code: ReasonCode, input: ExplainInput): string {
  switch (code) {
    case 'INVALID_INPUT':
      return 'The entered times are not valid.';
    case 'OUT_OF_DAY':
      return 'The requested times fall outside the 00:00–24:00 day range.';
    case 'START_AFTER_END':
      return 'The start time must come before the end time.';
    case 'PAST_START':
      return 'The start time must be in the future.';
    case 'TOO_LONG':
      return 'The booking exceeds the maximum duration of 120 minutes.';
    case 'ROOM_BLOCKED':
      return `${input.roomLabel} is currently blocked.`;
    case 'OVERLAP':
      return `The requested slot overlaps an existing booking.`;
    default:
      return 'The request could not be confirmed.';
  }
}
