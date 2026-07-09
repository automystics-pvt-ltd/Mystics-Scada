declare module "ssh2-sftp-client" {
  interface FileInfo {
    name: string;
    type: string;
    size: number;
    modifyTime: number;
    accessTime: number;
    rights: { user: string; group: string; other: string };
    owner: number | string;
    group: number | string;
  }

  interface ConnectOptions {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string | Buffer;
    passphrase?: string;
    readyTimeout?: number;
  }

  class SftpClient {
    connect(options: ConnectOptions): Promise<void>;
    list(remoteFilePath: string): Promise<FileInfo[]>;
    get(remoteFilePath: string, dst?: NodeJS.WritableStream | string | ((chunk: Buffer) => void)): Promise<Buffer | string | void>;
    put(localFilePath: string | Buffer | NodeJS.ReadableStream, remoteFilePath: string): Promise<void>;
    end(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export = SftpClient;
}
