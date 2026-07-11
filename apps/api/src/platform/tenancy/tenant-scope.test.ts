import { describe, expect, it } from 'vitest';
import { scopeArgs } from './tenant-scope';

const T = 'tenant-a';

describe('scopeArgs — the multi-tenancy guard', () => {
  it('injects tenantId into findMany where', () => {
    expect(scopeArgs('Item', 'findMany', undefined, T)).toEqual({ where: { tenantId: T } });
  });

  it('ANDs tenantId with an existing filter (cannot be overridden)', () => {
    const out = scopeArgs('Item', 'findMany', { where: { tenantId: 'evil', status: 'IN_STOCK' } }, T);
    expect(out.where).toEqual({ AND: [{ tenantId: T }, { tenantId: 'evil', status: 'IN_STOCK' }] });
    // AND-semantics: tenantId='evil' AND tenantId=T matches nothing — no leak.
  });

  it('merges tenantId into unique where for findUnique/update/delete', () => {
    for (const op of ['findUnique', 'update', 'delete']) {
      const out = scopeArgs('Document', op, { where: { id: 'x' } }, T);
      expect(out.where).toEqual({ id: 'x', tenantId: T });
    }
  });

  it('stamps tenantId into create data, overriding caller value', () => {
    const out = scopeArgs('Customer', 'create', { data: { name: 'A', tenantId: 'evil' } }, T);
    expect(out.data.tenantId).toBe(T);
  });

  it('stamps every row of createMany', () => {
    const out = scopeArgs('Tag', 'createMany', { data: [{ tagCode: '1' }, { tagCode: '2' }] }, T);
    expect(out.data.every((d: { tenantId: string }) => d.tenantId === T)).toBe(true);
  });

  it('strips tenantId from update data (no cross-tenant moves)', () => {
    const out = scopeArgs('Item', 'update', { where: { id: 'x' }, data: { tenantId: 'evil', name: 'n' } }, T);
    expect(out.data).toEqual({ name: 'n' });
  });

  it('scopes upsert on both sides', () => {
    const out = scopeArgs(
      'NumberSeries',
      'upsert',
      { where: { id: 'x' }, create: { seriesCode: 'INV' }, update: { tenantId: 'evil', nextNumber: 2 } },
      T,
    );
    expect(out.where.tenantId).toBe(T);
    expect(out.create.tenantId).toBe(T);
    expect(out.update).toEqual({ nextNumber: 2 });
  });

  it('leaves the Tenant model unscoped', () => {
    expect(scopeArgs('Tenant', 'findMany', { where: { id: 'x' } }, T)).toEqual({ where: { id: 'x' } });
  });

  it('does not mutate the input args', () => {
    const args = { where: { id: 'x' } };
    scopeArgs('Item', 'findUnique', args, T);
    expect(args).toEqual({ where: { id: 'x' } });
  });
});
