import { describe, it, expect } from 'vitest';
import { approveInterrupt, rejectInterrupt, getInterrupt } from '../src/index';
import type { Interrupt } from '../src/index';

const it1: Interrupt = {
  id: 'int_1',
  key: 'node:n:0',
  node: 'n',
  value: { amount: 5 },
  message: 'Refund?',
  reason: 'tool_approval',
  response_schema: null,
  tool_call_id: null,
};

describe('Interrupt helpers (G-156)', () => {
  it('approve echoes the interrupt id and defaults the value to true', () => {
    expect(approveInterrupt(it1)).toEqual({ resume: true, interrupt_id: 'int_1' });
    expect(approveInterrupt(it1, { approved: true })).toEqual({
      resume: { approved: true },
      interrupt_id: 'int_1',
    });
  });
  it('reject resumes with null (a cancel), keeping the id', () => {
    expect(rejectInterrupt(it1)).toEqual({ resume: null, interrupt_id: 'int_1' });
  });
  it('getInterrupt reads the payload from an interrupted updates chunk', () => {
    expect(
      getInterrupt({ event: 'updates', data: { status: 'interrupted', interrupt: it1 } })
    ).toEqual(it1);
    expect(getInterrupt({ event: 'message' })).toBeNull();
  });
});
