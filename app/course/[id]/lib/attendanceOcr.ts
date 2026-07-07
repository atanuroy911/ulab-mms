import { createWorker, PSM } from 'tesseract.js';

export interface OcrProgress {
  /** Index of the image currently being processed. */
  imageIndex: number;
  totalImages: number;
  /** 0..1 progress within the current image. */
  imageProgress: number;
  status: string;
}

/**
 * Runs OCR on each image in the browser via tesseract.js (WASM). The engine's core/worker/
 * language-data files are fetched from tesseract.js's default CDN on first use per browser
 * (then cached) - the images themselves never leave the client.
 */
export async function recognizeImages(
  files: File[],
  onProgress?: (progress: OcrProgress) => void
): Promise<string[]> {
  let currentIndex = 0;

  const worker = await createWorker('eng', undefined, {
    logger: (m) => {
      if (typeof m?.progress === 'number') {
        onProgress?.({
          imageIndex: currentIndex,
          totalImages: files.length,
          imageProgress: m.progress,
          status: m.status || 'recognizing',
        });
      }
    },
  });

  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

  const results: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      currentIndex = i;
      onProgress?.({ imageIndex: i, totalImages: files.length, imageProgress: 0, status: 'recognizing' });
      const { data } = await worker.recognize(files[i]);
      results.push(data.text || '');
    }
  } finally {
    await worker.terminate();
  }

  return results;
}
