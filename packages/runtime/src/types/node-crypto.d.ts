declare module "node:crypto" {
  export const createHash: (
    algorithm: string
  ) => {
    update: (data: string) => {
      digest: (encoding: "hex") => string;
    };
  };
}
