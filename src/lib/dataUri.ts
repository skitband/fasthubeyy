import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { downloadOnWeb } from './webDownload';

const MAX_IMAGE_SIDE = 1600;
// ~6 MB file once base64-encoded; keeps rows small enough for the web SQLite bridge.
const MAX_DATA_URI_CHARS = 8 * 1024 * 1024;

function isCompressibleImage(type: string | null, uri: string): boolean {
  if (type && type !== 'image/*') return /^image\/(jpe?g|png|webp|hei[cf])$/i.test(type);
  return type === 'image/*' || /\.(jpe?g|png|webp|hei[cf])$/i.test(uri);
}

async function compressImage(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  let image = await context.renderAsync();
  if (Math.max(image.width, image.height) > MAX_IMAGE_SIDE) {
    context.resize(image.width >= image.height ? { width: MAX_IMAGE_SIDE, height: null } : { width: null, height: MAX_IMAGE_SIDE });
    image = await context.renderAsync();
  }
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Image could not be encoded.');
  return `data:image/jpeg;base64,${saved.base64}`;
}

async function readRaw(uri: string, type: string | null): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
      reader.readAsDataURL(blob);
    });
  }
  const file = new File(uri);
  return `data:${type ?? (file.type || 'application/octet-stream')};base64,${await file.base64()}`;
}

// Reads a picked file into a data: URI so its contents are stored in the database rather than on disk.
export async function toDataUri(uri: string, mimeType?: string | null): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const hinted = mimeType && !mimeType.endsWith('/*') ? mimeType : null;
  const type = hinted ?? (Platform.OS === 'web' ? (mimeType ?? null) : new File(uri).type || mimeType || null);
  if (isCompressibleImage(type, uri)) {
    try {
      return await compressImage(uri);
    } catch {
      // Fall back to the original bytes if the image can't be decoded (e.g. unsupported format).
    }
  }
  const dataUri = await readRaw(uri, hinted);
  if (dataUri.length > MAX_DATA_URI_CHARS) {
    throw new Error('This file is too large to attach. Please choose a file under 6 MB.');
  }
  return dataUri;
}

function parseDataUri(uri: string): { mimeType: string; base64: string } {
  const comma = uri.indexOf(',');
  const header = uri.slice(5, comma);
  return { mimeType: header.split(';')[0] || 'application/octet-stream', base64: uri.slice(comma + 1) };
}

// Hands a stored attachment to the OS share sheet (native) or downloads it (web).
export async function shareStoredFile(uri: string, name: string) {
  if (!uri.startsWith('data:')) {
    await Sharing.shareAsync(uri, { dialogTitle: 'Open attachment' });
    return;
  }
  const { mimeType, base64 } = parseDataUri(uri);
  if (Platform.OS === 'web') {
    downloadOnWeb(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), name, mimeType);
    return;
  }
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'attachment';
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Open attachment' });
}
