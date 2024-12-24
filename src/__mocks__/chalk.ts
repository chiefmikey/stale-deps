const createChainableProxy = () => {
  const handler: ProxyHandler<any> = {
    get: (_: unknown, property: string) => {
      if (property === 'supportsColor') return { level: 3 };
      if (property === 'Level') {
        return { None: 0, Basic: 1, Ansi256: 2, Ansi16m: 3 };
      }
      return createChainableProxy();
    },
    apply: (_: unknown, __: unknown, arguments_: string[]) => arguments_[0],
  };

  return new Proxy((text: string) => text, handler);
};

const chalk = createChainableProxy();

export default chalk;
export const supportsColor = { level: 3 };
export const Level = { None: 0, Basic: 1, Ansi256: 2, Ansi16m: 3 };
export const chalkStderr = createChainableProxy();
export const supportsColorStderr = { level: 3 };
