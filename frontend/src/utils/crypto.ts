// src/utils/crypto.ts

import { useAuthStore } from '@/store/auth'
import type { MessageDto } from '@/types/Message'
import { uploadPublicKey, getPublicKey } from '@/services/chat.service'

/** Нормализация Base64 (URL-safe → стандартный) */
function normalizeBase64(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4 !== 0) s += '='
  return s
}

/** Base64 → ArrayBuffer */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const normalized = normalizeBase64(base64)
  const bin = atob(normalized)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** ArrayBuffer/TypedArray → Base64 */
export function bufferToBase64(input: ArrayBuffer | ArrayBufferView): string {
  const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

/** Генерация пары RSA-OAEP (2048 бит, SHA-256) */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
  )
}

/** Экспорт RSA-публичного ключа в SPKI→Base64 */
export async function exportRsaPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key)
  return bufferToBase64(spki)
}

/** Импорт RSA-публичного ключа из SPKI(Base64) */
export async function importRsaPublicKey(keyBase64: string): Promise<CryptoKey> {
  const buff = base64ToBuffer(keyBase64)
  return crypto.subtle.importKey(
      'spki', buff,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
  )
}

/** Экспорт RSA-приватного ключа в PKCS#8→Base64 */
export async function exportRsaPrivateKey(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', key)
  return bufferToBase64(pkcs8)
}

/** В памяти и в Pinia-сторе */
let _privateKeyInstance: CryptoKey | null = null

/** Сохранение приватного ключа в localStorage (PKCS#8 Base64) */
export async function storePrivateKey(key: CryptoKey): Promise<void> {
  const b64 = await exportRsaPrivateKey(key)
  localStorage.setItem('privateKeyBase64', b64)
  _privateKeyInstance = key
  const auth = useAuthStore()
  auth.privateKey = key
}

/** Загрузка приватного ключа из localStorage */
export async function loadPrivateKey(): Promise<CryptoKey> {
  if (_privateKeyInstance) {
    return _privateKeyInstance
  }

  const b64 = localStorage.getItem('privateKeyBase64')
  if (!b64) {
    throw new Error('Нет приватного ключа в хранилище')
  }

  const buffer = base64ToBuffer(b64)
  const key = await crypto.subtle.importKey(
      'pkcs8', buffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
  )
  _privateKeyInstance = key
  const auth = useAuthStore()
  auth.privateKey = key
  return key
}

/** Генерация AES-GCM ключа (256 бит) */
export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
  )
}

/** Генерация IV для AES-GCM (96 бит) */
export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12))
}

/** AES-GCM шифрование */
export async function encryptMessageWithAes(
    plaintext: string,
    aesKey: CryptoKey,
    iv: Uint8Array
): Promise<ArrayBuffer> {
  const encoded = new TextEncoder().encode(plaintext)
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded)
}

/** AES-GCM дешифрование */
export async function decryptMessageWithAes(
    ciphertext: ArrayBuffer,
    aesKey: CryptoKey,
    iv: Uint8Array
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
}

/** RSA-OAEP шифрование AES-ключа */
export async function encryptAesKeyWithRsa(
    aesKey: CryptoKey,
    publicKey: CryptoKey
): Promise<ArrayBuffer> {
  const raw = await crypto.subtle.exportKey('raw', aesKey)
  return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, raw)
}

/** RSA-OAEP дешифрование AES-ключа */
export async function decryptAesKeyWithRsa(
    encryptedKey: ArrayBuffer,
    privateKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedKey)
}

/** Получение публичного ключа (локально или из API) */
async function getPublicKeyBase64(userId: string | null): Promise<string> {
  if (!userId) {
    throw new Error('userId отсутствует')
  }
  const auth = useAuthStore()
  if (userId === auth.userId) {
    const cacheKey = `publicKey_${auth.userId}`
    let stored = localStorage.getItem(cacheKey)
    if (!stored) {
      await generateAndUploadKeyPair()
      stored = auth.publicKey!
      localStorage.setItem(cacheKey, stored)
    }
    return stored
  }

  const cacheKey = `publicKey_${userId}`
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    return cached
  }
  const keyBase64 = await getPublicKey(userId)
  localStorage.setItem(cacheKey, keyBase64)
  return keyBase64
}

/** Шифрование для получателя — возвращает данные шифрования */
export async function encryptForRecipient(
    recipientId: string,
    plaintext: string
): Promise<{ encryptedContent: string; encryptedAesKey: string; iv: string }> {
  // 1) Генерируем AES-ключ и IV
  const aesKey = await generateAesKey()
  const iv     = generateIv()

  // 2) Шифруем тело сообщения AES-GCM
  const cipher = await encryptMessageWithAes(plaintext, aesKey, iv)

  // 3) Получаем публичный ключ получателя
  const keyB64 = await getPublicKeyBase64(recipientId)
  console.log('Используем public key для шифрования:', keyB64)

  // 4) Импортируем RSA-ключ и шифруем AES-ключ
  const rsaPub   = await importRsaPublicKey(keyB64)
  const encAesKey = await encryptAesKeyWithRsa(aesKey, rsaPub)

  // 5) Возвращаем всё в Base64
  return {
    encryptedContent: bufferToBase64(cipher),
    encryptedAesKey:  bufferToBase64(encAesKey),
    iv:               bufferToBase64(iv),
  }
}

/** Дешифровка входящего сообщения */
// export async function decryptMessageContent(msg: MessageDto): Promise<string> {
//   const auth = useAuthStore()
//   console.log('Используем private key:', auth.privateKey ?? 'не загружен, loadPrivateKey()')
//   try {
//     if (!msg.encryptedAesKey || !msg.encryptedContent || !msg.iv) {
//       throw new Error('Поля сообщения отсутствуют')
//     }

//     const auth = useAuthStore()
//     const privKey = auth.privateKey ?? await loadPrivateKey()

//     // console.log('🔑 Encrypted AES key (B64):', msg.encryptedAesKey)
//     // console.log('📜 Ciphertext (B64):', msg.encryptedContent)
//     // console.log('🔬 IV (B64):', msg.iv)

//     const aesRaw = await decryptAesKeyWithRsa(
//         base64ToBuffer(msg.encryptedAesKey),
//         privKey
//     )
//     // console.log('🔑 AES raw key bytes:', new Uint8Array(aesRaw))

//     const aesKey = await crypto.subtle.importKey(
//         'raw',
//         aesRaw,
//         { name: 'AES-GCM' },
//         false,
//         ['decrypt']
//     )

//     const ivBuf = new Uint8Array(base64ToBuffer(msg.iv))
//     const cipherBuf = base64ToBuffer(msg.encryptedContent)
//     // console.log('🔬 IV bytes:', ivBuf)
//     // console.log('📜 Cipher bytes:', new Uint8Array(cipherBuf))

//     const plainBuf = await decryptMessageWithAes(cipherBuf, aesKey, ivBuf)
//     return new TextDecoder().decode(plainBuf)

//   } catch (err: any) {
//     console.error('Ошибка при расшифровке сообщения:', err)
//     return '[Ошибка расшифровки]'
//   }
// }


export async function decryptMessageContent(msg: MessageDto): Promise<string> {
  console.log('🔍 [decrypt] входящие данные:', msg);

  try {
    // Проверка полей
    if (!msg.encryptedAesKey || !msg.encryptedContent || !msg.iv) {
      console.error('❌ [decrypt] отсутствуют поля:', {
        encryptedAesKey: !!msg.encryptedAesKey,
        encryptedContent: !!msg.encryptedContent,
        iv: !!msg.iv,
      });
      throw new Error('Поля сообщения отсутствуют');
    }

    // 1) приватный ключ
    console.log('🔑 [decrypt] загружаем приватный ключ…');
    const privKey = await loadPrivateKey();
    console.log('✅ [decrypt] приватный ключ:', privKey);

    // 2) расшифровка AES-ключа
    const aesKeyBuf = base64ToBuffer(msg.encryptedAesKey);
    console.log('📦 [decrypt] AES-ключ (шифр, bytes):', new Uint8Array(aesKeyBuf));
    let aesRaw: ArrayBuffer;
    try {
      console.log('🔓 [decrypt] decryptAesKeyWithRsa start');
      aesRaw = await decryptAesKeyWithRsa(aesKeyBuf, privKey);
      console.log('✅ [decrypt] AES-ключ (raw, bytes):', new Uint8Array(aesRaw));
    } catch (err) {
      console.error('❌ [decrypt] decryptAesKeyWithRsa failed:', err);
      throw err;
    }

    // 3) импорт AES-ключа
    let aesCryptoKey: CryptoKey;
    try {
      console.log('🔨 [decrypt] importKey(AES-GCM) start');
      aesCryptoKey = await crypto.subtle.importKey(
        'raw',
        aesRaw,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      console.log('✅ [decrypt] AES-ключ импортирован:', aesCryptoKey);
    } catch (err) {
      console.error('❌ [decrypt] importKey failed:', err);
      throw err;
    }

    // 4) подготовка IV и шифртекста
    const ivBuf     = new Uint8Array(base64ToBuffer(msg.iv));
    const cipherBuf = base64ToBuffer(msg.encryptedContent);
    console.log('🧰 [decrypt] IV (bytes,len):', ivBuf, ivBuf.length);
    console.log('🔐 [decrypt] Ciphertext (bytes,len):', new Uint8Array(cipherBuf), cipherBuf.byteLength);

    // 5) AES-дешифрование
    try {
      console.log('🚀 [decrypt] decryptMessageWithAes start');
      const plainBuf = await decryptMessageWithAes(cipherBuf, aesCryptoKey, ivBuf);
      const text = new TextDecoder().decode(plainBuf);
      console.log('🎉 [decrypt] Дешифрованный текст:', text);
      return text;
    } catch (err) {
      console.error('❌ [decrypt] decryptMessageWithAes failed:', err);
      throw err;
    }

  } catch (err: any) {
    console.error('❗️ [decrypt] финальная ошибка:', err);
    return '[Ошибка расшифровки]';
  }
}




/** Генерация пары RSA-OAEP и загрузка публичного ключа на сервер */
export async function generateAndUploadKeyPair(): Promise<void> {
  const keyPair = await generateKeyPair()
  const publicKeyBase64 = await exportRsaPublicKey(keyPair.publicKey)
  await uploadPublicKey(publicKeyBase64)
  await storePrivateKey(keyPair.privateKey)

  const auth = useAuthStore()
  auth.publicKey = publicKeyBase64
  localStorage.setItem(`publicKey_${auth.userId}`, publicKeyBase64)
}
