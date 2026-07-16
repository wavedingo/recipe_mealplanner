// Manual mock for `next-auth/providers/credentials` — see ../../next-auth.js
// for why this exists. The real provider factory just needs to return
// something Credentials(config) can be called with in src/lib/auth.ts
// without pulling in the real ESM package.
function Credentials(config) {
  return { id: 'credentials', type: 'credentials', ...config };
}

module.exports = Credentials;
module.exports.default = Credentials;
