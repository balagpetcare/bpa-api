import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      require('fs').writeFileSync('D:/bpa_main/bpa_api/zod_error.json', JSON.stringify({ body: req.body, error: result.error }, null, 2)); next(result.error);
      return;
    }
    req[target] = result.data;
    next();
  };
}
