import { describe, expect, it } from 'vitest';
import type { LearnContent } from '../types';
import { applyModuleCompletion } from './content';

/**
 * Offline there is no server to recompute progress, so the app does the same
 * arithmetic locally. If these two ever disagree the progress bar jumps when a
 * queued change syncs, which reads as data loss even though nothing was lost.
 */

const module = (id: string, completed: boolean) => ({ id, title: id, description: null, position: 0, durationMinutes: 10, completed, materials: [] });

const content = (completed: string[]): LearnContent =>
  ({
    preview: false,
    course: { id: 'c1', title: 'Radar', description: '', category: 'Core', difficulty: 'INTERMEDIATE', status: 'PUBLISHED', durationMinutes: 30, outcomes: [], certificateEnabled: true, trainer: { id: 't1', name: 'Trainer', designation: null } },
    modules: ['m1', 'm2', 'm3', 'm4'].map((id) => module(id, completed.includes(id))),
    enrollment: { id: 'e1', status: 'IN_PROGRESS', progress: completed.length * 25, enrolledAt: '2026-01-01T00:00:00.000Z', lastAccessedAt: null, completedModuleIds: completed },
    assessment: null,
    certificate: null,
  }) as LearnContent;

describe('applyModuleCompletion', () => {
  it('marks the module and moves progress by its share of the course', () => {
    const result = applyModuleCompletion(content(['m1']), 'm2', true);
    expect(result.modules.find((item) => item.id === 'm2')?.completed).toBe(true);
    expect(result.enrollment?.progress).toBe(50);
    expect(result.enrollment?.completedModuleIds).toEqual(['m1', 'm2']);
  });

  it('reverses a completion the same way', () => {
    const result = applyModuleCompletion(content(['m1', 'm2']), 'm2', false);
    expect(result.enrollment?.progress).toBe(25);
    expect(result.enrollment?.completedModuleIds).toEqual(['m1']);
  });

  it('leaves the original untouched, so a failed sync can fall back to it', () => {
    const before = content(['m1']);
    applyModuleCompletion(before, 'm2', true);
    expect(before.modules.find((item) => item.id === 'm2')?.completed).toBe(false);
    expect(before.enrollment?.progress).toBe(25);
  });

  it('is unbothered by a course somebody is only previewing (no enrolment)', () => {
    const preview = { ...content([]), enrollment: null };
    expect(applyModuleCompletion(preview, 'm1', true).enrollment).toBeNull();
  });
});
