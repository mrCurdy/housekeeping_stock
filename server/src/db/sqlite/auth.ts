import type { PinRole, Role } from '@app/shared';
import type { AuthRepo } from '../types';
import type { Ctx } from './rows';

/** Auth rows are outside the dataset, so they skip write() (no backup, no prune). */
export function createAuth({ get, all, run, transaction }: Ctx): AuthRepo {
  /** Deletes every QR link and the counter sessions opened from them. */
  const deleteQrLinks = () => {
    run('DELETE FROM sessions WHERE link_id IS NOT NULL');
    run('DELETE FROM qr_links');
  };
  return {
    async pinHashes() {
      const rows = all<{ role: PinRole; hash: string }>('SELECT role, hash FROM pins');
      return Object.fromEntries(rows.map((r) => [r.role, r.hash]));
    },
    async setPinHash(role, hash) {
      run(
        'INSERT INTO pins (role, hash) VALUES (?, ?) ON CONFLICT (role) DO UPDATE SET hash = excluded.hash',
        role,
        hash,
      );
    },
    async createSession(tokenHash, role, linkId) {
      run(
        'INSERT INTO sessions (token_hash, role, link_id, created_at) VALUES (?, ?, ?, ?)',
        tokenHash,
        role,
        linkId ?? null,
        new Date().toISOString(),
      );
    },
    async sessionRole(tokenHash) {
      return (
        get<{ role: Role }>('SELECT role FROM sessions WHERE token_hash = ?', tokenHash)?.role ??
        null
      );
    },
    async deleteSession(tokenHash) {
      run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    },
    async deleteSessions(role, keep = '') {
      run('DELETE FROM sessions WHERE role = ? AND token_hash != ?', role, keep);
    },
    async qrLink() {
      return (
        get<{ id: string; createdAt: string }>(
          'SELECT id, created_at AS createdAt FROM qr_links ORDER BY created_at DESC LIMIT 1',
        ) ?? null
      );
    },
    async setQrLink(id, tokenHash) {
      const createdAt = new Date().toISOString();
      transaction(() => {
        deleteQrLinks();
        run(
          'INSERT INTO qr_links (id, token_hash, created_at) VALUES (?, ?, ?)',
          id,
          tokenHash,
          createdAt,
        );
      });
      return { id, createdAt };
    },
    async deleteQrLink() {
      transaction(deleteQrLinks);
    },
    async qrLinkId(tokenHash) {
      return (
        get<{ id: string }>('SELECT id FROM qr_links WHERE token_hash = ?', tokenHash)?.id ?? null
      );
    },
  };
}
