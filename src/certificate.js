import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { log } from './logger.js';

const execFileAsync = promisify(execFile);
const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'tools',
  'cert-generate.sh'
);

// generate server cert
export const generateCert = async (apiObj) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const clusterDomain = process.env.CLUSTER_DOMAIN || 'cluster.local';
  const outDir = mkdtempSync(join(tmpdir(), `qdrant-cert-${name}-`));

  try {
    const { stdout } = await execFileAsync(scriptPath, [
      '--name',
      name,
      '--namespace',
      namespace,
      '--domain',
      clusterDomain,
      '--out-dir',
      outDir
    ]);
    if (stdout) {
      log(stdout);
    }
    return {
      'cert.pem': readFileSync(join(outDir, 'cert.pem'), 'utf8'),
      'key.pem': readFileSync(join(outDir, 'key.pem'), 'utf8'),
      'cacert.pem': readFileSync(join(outDir, 'cacert.pem'), 'utf8')
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
};
