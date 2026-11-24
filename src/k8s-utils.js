import { log } from './logger.js';

export const CRD_GROUP = 'qdrant.operator';
export const CRD_VERSION = 'v1alpha1';

export const statusCode = (err) => err?.code ?? err?.statusCode;
export const isNotFound = (err) => statusCode(err) === 404;
export const isConflict = (err) => statusCode(err) === 409;

export const toBase64 = (value) =>
  Buffer.from(String(value), 'utf8').toString('base64');
export const fromBase64 = (value) =>
  Buffer.from(value, 'base64').toString('utf8');

// Shared read-then-update-or-create helper that only falls through to create on 404
export const upsertResource = async ({ label, read, update, create }) => {
  let exists = false;
  try {
    await read();
    exists = true;
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  if (exists) {
    log(`${label} already exists. Updating...`);
    await update();
    log(`${label} updated successfully.`);
  } else {
    log(`${label} not found. Creating...`);
    await create();
    log(`${label} created successfully.`);
  }
};
