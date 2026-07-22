import { localProfileUpdateSchema } from '../me.profile.types';

describe('localProfileUpdateSchema', () => {
  it('accepts BPA-local address fields', () => {
    const parsed = localProfileUpdateSchema.parse({
      divisionId: '11111111-1111-1111-1111-111111111111',
      districtId: null,
      addressLine: 'House 12, Road 5, Dhaka',
    });

    expect(parsed).toEqual({
      divisionId: '11111111-1111-1111-1111-111111111111',
      districtId: null,
      addressLine: 'House 12, Road 5, Dhaka',
    });
  });

  it('rejects Central Auth-owned identity fields', () => {
    const result = localProfileUpdateSchema.safeParse({
      name: 'Duplicated Name',
      email: 'duplicate@example.com',
      phone: '01700000000',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    expect(result.success).toBe(false);
  });
});
