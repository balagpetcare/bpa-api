import { AppError } from '../../../utils/AppError';

const uploadSingleMock = jest.fn();

jest.mock('../../../middlewares/upload', () => ({
  uploadSingle: (...args: unknown[]) => uploadSingleMock(...args),
}));

describe('uploadPetAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps size failures to 413', () => {
    uploadSingleMock.mockImplementation((_req, _res, next) => {
      next(new AppError(400, 'LIMIT_FILE_SIZE', 'too large'));
    });

    const { uploadPetAsset } = require('../me.pet-upload.middleware');
    const next = jest.fn();

    uploadPetAsset({} as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' }));
  });

  it('maps unsupported media to 415', () => {
    uploadSingleMock.mockImplementation((_req, _res, next) => {
      next(new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'bad type'));
    });

    const { uploadPetAsset } = require('../me.pet-upload.middleware');
    const next = jest.fn();

    uploadPetAsset({} as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE' }));
  });

  it('maps invalid file bytes to 422', () => {
    uploadSingleMock.mockImplementation((_req, _res, next) => {
      next(new AppError(400, 'INVALID_FILE_CONTENT', 'corrupt file'));
    });

    const { uploadPetAsset } = require('../me.pet-upload.middleware');
    const next = jest.fn();

    uploadPetAsset({} as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422, code: 'INVALID_FILE_CONTENT' }));
  });
});
