import bcrypt from 'bcryptjs';

jest.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

import { prisma } from '@/lib/db';
import { verifyCredentials } from '@/lib/auth';

const findUnique = prisma.user.findUnique as jest.Mock;

describe('verifyCredentials', () => {
  const hash = bcrypt.hashSync('correct-password', 4);

  beforeEach(() => findUnique.mockReset());

  it('returns the user for a valid email + password', async () => {
    findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash,
    });
    await expect(verifyCredentials('A@b.com ', 'correct-password')).resolves.toMatchObject({ id: 'u1' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  it('rejects a wrong password', async () => {
    findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash,
    });
    await expect(verifyCredentials('a@b.com', 'wrong')).resolves.toBeNull();
  });

  it('rejects an unknown email', async () => {
    findUnique.mockResolvedValue(null);
    await expect(verifyCredentials('nobody@b.com', 'x')).resolves.toBeNull();
  });

  it('rejects a user with NULL passwordHash', async () => {
    findUnique.mockResolvedValue({
      id: 'household-user', email: 'household@placeholder.local', name: 'Household', passwordHash: null,
    });
    await expect(verifyCredentials('household@placeholder.local', 'anything')).resolves.toBeNull();
  });

  it('rejects missing email or password', async () => {
    await expect(verifyCredentials(undefined, 'x')).resolves.toBeNull();
    await expect(verifyCredentials('a@b.com', undefined)).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
