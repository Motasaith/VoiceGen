/** espeak-ng ships no type declarations; this is the shape we actually use. */
declare module "espeak-ng" {
  interface ESpeakInstance {
    FS: {
      readFile(path: string, options: { encoding: "utf8" }): string;
      readFile(path: string): Uint8Array;
    };
  }
  export default function ESpeakNg(
    options: { arguments: string[] },
  ): Promise<ESpeakInstance>;
}
