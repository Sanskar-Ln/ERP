/**
 * OcrService — reads text off uploaded paper-bill images with tesseract.js.
 *
 * Fully offline: the English trained data ships as the npm package
 * `@tesseract.js-data/eng` (resolved locally at runtime), so no CDN access
 * is needed. The worker is created lazily on first use and reused —
 * spawning a tesseract worker is expensive (~1s), recognizing is cheap.
 *
 * Images only (JPEG/PNG/WebP). PDFs are rejected upstream with a clear
 * message — rasterizing PDFs is out of MVP scope.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';
import { dirname, join } from 'path';

@Injectable()
export class OcrService implements OnModuleDestroy {
  private worker: Promise<Worker> | null = null;

  /** Lazily create (once) the shared tesseract worker with local tessdata. */
  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      // node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz
      const engDir = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
      this.worker = createWorker('eng', 1, {
        langPath: join(engDir, '4.0.0_best_int'),
        gzip: true,
      });
    }
    return this.worker;
  }

  /** OCR an image file on disk → raw recognized text. */
  async recognize(imagePath: string): Promise<string> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(imagePath);
    return data.text;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await (await this.worker).terminate();
  }
}
