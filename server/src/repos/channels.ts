import { query } from '../db/pool';
import type { Channel } from '../youtube/types';

export interface ChannelRow extends Channel {
  sort_order: number;
}

export async function listChannels(): Promise<ChannelRow[]> {
  try {
    const { rows } = await query<ChannelRow>(
      `SELECT id, title, thumb, uploads, sort_order, COALESCE(language, 'English') as language 
       FROM channels 
       ORDER BY sort_order ASC, title ASC`
    );
    return rows;
  } catch (e) {
    const { rows } = await query<ChannelRow>('SELECT id, title, thumb, uploads, sort_order FROM channels ORDER BY sort_order ASC, title ASC');
    return rows.map(r => ({ ...r, language: 'English' }));
  }
}

export async function addChannel(c: Channel, addedBy: string | null, language: string = 'English'): Promise<ChannelRow> {
  try {
    const { rows } = await query<ChannelRow>(
      `INSERT INTO channels (id, title, thumb, uploads, language, added_by, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sort_order) + 1 FROM channels), 0))
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, thumb = EXCLUDED.thumb, uploads = EXCLUDED.uploads, language = EXCLUDED.language
       RETURNING id, title, thumb, uploads, language, sort_order`,
      [c.id, c.title, c.thumb, c.uploads, language, addedBy],
    );
    return rows[0];
  } catch (e) {
    const { rows } = await query<ChannelRow>(
      `INSERT INTO channels (id, title, thumb, uploads, added_by, sort_order)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sort_order) + 1 FROM channels), 0))
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, thumb = EXCLUDED.thumb, uploads = EXCLUDED.uploads
       RETURNING id, title, thumb, uploads, sort_order`,
      [c.id, c.title, c.thumb, c.uploads, addedBy],
    );
    return { ...rows[0], language };
  }
}

export async function removeChannel(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM channels WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function getChannel(id: string): Promise<ChannelRow | null> {
  try {
    const { rows } = await query<ChannelRow>('SELECT id, title, thumb, uploads, sort_order, COALESCE(language, \'English\') as language FROM channels WHERE id = $1', [id]);
    return rows[0] || null;
  } catch {
    const { rows } = await query<ChannelRow>('SELECT id, title, thumb, uploads, sort_order FROM channels WHERE id = $1', [id]);
    return rows[0] ? { ...rows[0], language: 'English' } : null;
  }
}
