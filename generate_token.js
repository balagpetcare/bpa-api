const jwt = require('jsonwebtoken');

// Look up the secret from .env
require('dotenv').config();

const token = jwt.sign(
  { sub: 'cmrcla6qk0017gg8osmkw6z08', email: 'balag999@gmail.com', roles: ['USER'] },
  process.env.CENTRAL_AUTH_JWT_SECRET,
  { algorithm: process.env.CENTRAL_AUTH_JWT_ALGORITHM, issuer: process.env.CENTRAL_AUTH_JWT_ISSUER, audience: process.env.CENTRAL_AUTH_JWT_AUDIENCE }
);

console.log(token);
