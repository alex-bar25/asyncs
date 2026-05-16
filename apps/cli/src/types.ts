export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ParseResult<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      error: string;
    };
