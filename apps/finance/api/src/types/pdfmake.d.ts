declare module 'pdfmake' {
  interface FontDescriptor {
    normal?: string;
    bold?: string;
    italics?: string;
    bolditalics?: string;
  }

  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
  }

  interface Pdfmake {
    setFonts(fonts: Record<string, FontDescriptor>): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    createPdf(docDefinition: Record<string, unknown>, options?: Record<string, unknown>): OutputDocument;
  }

  const pdfmake: Pdfmake;
  export default pdfmake;
}
