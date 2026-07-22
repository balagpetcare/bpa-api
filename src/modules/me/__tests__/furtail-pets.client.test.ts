import { AppError } from '../../../utils/AppError';
import {
  deleteFurtailPet,
  listFurtailPets,
  uploadFurtailMedia,
} from '../furtail-pets.client';

describe('furtail-pets.client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries safe GET requests on retryable upstream status', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: { code: 'UPSTREAM_BUSY', message: 'busy' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [{ id: 1, name: 'Milo' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    global.fetch = fetchMock as any;

    const pets = await listFurtailPets('Bearer token');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pets).toEqual([{ id: 1, name: 'Milo' }]);
  });

  it('does not retry destructive DELETE requests', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { code: 'PET_DELETE_FAILED', message: 'failed' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as any;

    await expect(deleteFurtailPet('Bearer token', '44')).rejects.toBeInstanceOf(AppError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uploads media with multipart form data and without forcing JSON content-type', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 91, url: 'https://cdn.example.com/file.jpg' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as any;

    await uploadFurtailMedia(
      'Bearer token',
      {
        fieldname: 'file',
        originalname: 'report.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1234,
        buffer: Buffer.from('image-bytes'),
        stream: undefined as any,
        destination: '',
        filename: '',
        path: '',
      },
      { requestId: 'req-1' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers['X-Request-Id']).toBe('req-1');
  });
});
