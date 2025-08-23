type AuthenticateFunction = (username: string, password: string, callback: (err: Error | null, authenticated?: boolean) => void) => void;
declare let authenticate: AuthenticateFunction;
export { authenticate };
