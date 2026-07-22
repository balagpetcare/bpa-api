declare module 'imapflow' {
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
    logger?: any;
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
  }

  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    getMailboxLock(path: string): Promise<any>;
    list(): Promise<any[]>;
    select(path: string): Promise<any>;
    mailboxOpen(path: string, options?: any): Promise<any>;
    search(query: any): Promise<number[]>;
    fetch(range: any, query: any): AsyncIterable<any>;
    fetchOne(uid: number, query: any): Promise<any>;
    messageFlagsAdd(range: any, flags: string[]): Promise<void>;
    messageFlagsRemove(range: any, flags: string[]): Promise<void>;
    deleteMessages(range: any): Promise<void>;
  }
}
