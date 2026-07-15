import { describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { soloApi } from './solo';

describe('soloApi', () => {
  it('passes plain objects for spin body', async () => {
    const requestSpy = vi.spyOn(client, 'apiRequest').mockResolvedValue({} as never);

    await soloApi.spin('neon_scratch', 10, 'key-1');

    expect(requestSpy).toHaveBeenCalledWith('/api/v1/solo/spin', {
      method: 'POST',
      body: {
        game: 'neon_scratch',
        bet_coins: 10,
        idempotency_key: 'key-1',
      },
    });
  });

  it('requests active session with game query', async () => {
    const requestSpy = vi.spyOn(client, 'apiRequest').mockResolvedValue({} as never);

    await soloApi.activeSession('crystal_mines');

    expect(requestSpy).toHaveBeenCalledWith('/api/v1/solo/sessions/active?game=crystal_mines');
  });
});
