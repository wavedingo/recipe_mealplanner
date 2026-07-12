import { validateRegistration } from '../validate-registration';

describe('validateRegistration', () => {
  const valid = { email: 'A@Example.com ', name: ' Jane ', password: 'longenough' };

  it('accepts valid input, normalizing email and trimming name', () => {
    const r = validateRegistration(valid);
    expect(r).toEqual({
      ok: true,
      value: { email: 'a@example.com', name: 'Jane', password: 'longenough' },
    });
  });

  it.each([
    [null, 'Invalid request body'],
    ['x', 'Invalid request body'],
    [{ ...valid, email: 'not-an-email' }, 'A valid email is required'],
    [{ ...valid, email: undefined }, 'A valid email is required'],
    [{ ...valid, name: '  ' }, 'Name is required'],
    [{ ...valid, password: 'short7!' }, 'Password must be at least 8 characters'],
    [{ ...valid, password: 12345678 }, 'Password must be at least 8 characters'],
  ])('rejects %j', (input, error) => {
    expect(validateRegistration(input)).toEqual({ ok: false, error });
  });
});
