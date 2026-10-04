export function requireAdmin(req, res, next) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) return res.status(503).send('Admin credentials are not configured.');

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return challenge(res);
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const split = decoded.indexOf(':');
  const user = decoded.slice(0, split);
  const password = decoded.slice(split + 1);
  if (user !== expectedUser || password !== expectedPassword) return challenge(res);
  next();
}

function challenge(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Off Dial Admin"');
  return res.status(401).send('Authentication required.');
}
