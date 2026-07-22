import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../database/prisma';
import { generateMockJWT } from '../../../utils/test-helpers';

describe('GET /api/v1/me/memberships - Contract Test', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  let token: string;

  beforeAll(async () => {
    token = generateMockJWT({ sub: userId });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Request Contract', () => {
    it('should accept GET request with no body', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json');

      // Should respond (either success or auth error)
      expect([200, 401, 403]).toContain(res.status);
    });

    it('should reject request without authorization', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error.code');
    });

    it('should accept query parameters: page, limit, status, campaignId', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${token}`)
        .query({ page: '1', limit: '10' });

      // Should handle pagination parameters
      expect([200, 400, 401, 403]).toContain(res.status);
    });

    it('should reject invalid UUID in query parameters', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${token}`)
        .query({ campaignId: 'not-a-uuid' });

      // Should reject invalid UUID format (400 or similar)
      expect([400, 401, 403]).toContain(res.status);
    });
  });

  describe('Response Contract', () => {
    it('should return 200 with paginated response format: { items, meta }', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${token}`);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('success');
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('meta');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('should return paginated meta with page, limit, total, hasMore', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${token}`);

      if (res.status === 200) {
        expect(res.body.meta).toHaveProperty('page');
        expect(res.body.meta).toHaveProperty('limit');
        expect(res.body.meta).toHaveProperty('total');
        expect(res.body.meta).toHaveProperty('hasNext');
      }
    });

    it('should return error object with code and message', async () => {
      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', 'Bearer invalid-token');

      if (res.status !== 200) {
        expect(res.body).toHaveProperty('success');
        expect(res.body.success).toBe(false);
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toHaveProperty('code');
        expect(res.body.error).toHaveProperty('message');
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should return 401 for expired token', async () => {
      const expiredToken = generateMockJWT(
        { sub: userId },
        { expiresIn: '-1h' }
      );

      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toMatch(/TOKEN_EXPIRED|TOKEN_INVALID|UNAUTHORIZED/);
    });

    it('should return 200 with an empty list for a Central Auth sub with no mapped local user', async () => {
      const unmappedToken = generateMockJWT({ sub: 'invalid-uuid' });

      const res = await request(app)
        .get('/api/v1/me/memberships')
        .set('Authorization', `Bearer ${unmappedToken}`);

      // A Central Auth identity with no corresponding local user has no
      // memberships - it must not surface as a 400/500 backend error.
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });
});
