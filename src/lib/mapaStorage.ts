/**
 * mapaStorage.ts
 * Upload binário de mapas para Supabase Storage.
 * Substitui completamente a conversão Base64.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const BUCKET = 'mapas';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Comprime imagem para WEBP e faz upload binário. Retorna URL pública. */
export async function uploadMapaImagem(
  file: File,
  empreendimentoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);

  // 1. Converter para WEBP comprimido
  const webpBlob = await comprimirParaWebP(file, 0.82);
  onProgress?.(40);

  // 2. Nome único
  const ext = 'webp';
  const nome = `${empreendimentoId}_${Date.now()}.${ext}`;

  // 3. Upload binário
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(nome, webpBlob, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) throw new Error('Upload falhou: ' + error.message);
  onProgress?.(90);

  // 4. URL pública
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nome);
  onProgress?.(100);

  return urlData.publicUrl;
}

/** Comprime File para WEBP via Canvas. */
async function comprimirParaWebP(file: File, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // Limitar resolução máxima para 4000px
      const MAX = 4000;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob falhou')),
        'image/webp',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

/** Upload de PDF — armazena binário, retorna URL. */
export async function uploadMapaPDF(
  file: File,
  empreendimentoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);
  const nome = `${empreendimentoId}_${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(nome, file, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error('Upload PDF falhou: ' + error.message);
  onProgress?.(90);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
  onProgress?.(100);
  return data.publicUrl;
}

/** Pré-cacheia a URL no Service Worker para acesso offline imediato. */
export function precacheMapaUrl(url: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_URL', url });
  }
}
