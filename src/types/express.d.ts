import { AuthPayload } from './index';

declare global {
  namespace Express {
    interface Request {
      user: AuthPayload;
      requestId?: string;
    }
  }
}

export {};
