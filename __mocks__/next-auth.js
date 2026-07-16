// Manual mock for the `next-auth` package (Jest auto-applies files placed in
// <rootDir>/__mocks__ adjacent to node_modules for every test, no jest.mock()
// call required). next-auth v5 beta ships ESM-only with no CJS build, which
// ts-jest/Jest (running under CommonJS) cannot load. Unit tests such as
// src/lib/__tests__/auth-authorize.test.ts only need `@/lib/auth` to evaluate
// without throwing so they can reach the exported `verifyCredentials` helper;
// they don't exercise NextAuth's real session/handler behavior.
function NextAuth() {
  return {
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(async () => null),
    signIn: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  };
}

module.exports = NextAuth;
module.exports.default = NextAuth;

// Real next-auth also re-exports this from @auth/core; not used by the
// current test suite, but harmless to provide.
class AuthError extends Error {}
module.exports.AuthError = AuthError;
