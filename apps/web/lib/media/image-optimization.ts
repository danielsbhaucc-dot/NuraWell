import sharp from 'sharp';

export interface OptimizationOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
}

const DEFAULT_OPTIONS: Required<OptimizationOptions> = {
  width: 1200,
  height: 630,
  fit: 'cover',
  quality: 80,
  format: 'webp',
};

export async function optimizeImage(
  input: Buffer,
  options?: OptimizationOptions
): Promise<{ buffer: Buffer; contentType: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let pipeline = sharp(input);

  // Resize if needed
  if (opts.width || opts.height) {
    pipeline = pipeline.resize({
      width: opts.width,
      height: opts.height,
      fit: opts.fit,
      withoutEnlargement: true,
    });
  }

  // Convert format
  switch (opts.format) {
    case 'webp':
      pipeline = pipeline.webp({ quality: opts.quality });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: opts.quality });
      break;
    case 'png':
      pipeline = pipeline.png({ quality: opts.quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality: opts.quality });
      break;
  }

  const buffer = await pipeline.toBuffer();
  const contentType = `image/${opts.format === 'jpeg' ? 'jpeg' : opts.format}`;

  return { buffer, contentType };
}

export async function optimizeImageToWebP(
  input: Buffer,
  width?: number,
  height?: number,
  quality?: number
): Promise<Buffer> {
  const { buffer } = await optimizeImage(input, {
    width,
    height,
    format: 'webp',
    quality: quality ?? 80,
  });
  return buffer;
}
