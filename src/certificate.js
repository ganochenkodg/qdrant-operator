import { log } from './index.js';
import { exec } from 'child_process';
import * as fs from 'fs';

// black magic tu turn .exec into Promise
const execShellCommand = async (cmd) => {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(error);
      }
      resolve(stdout ? stdout : stderr);
    });
  });
};

// generate server cert
export const generateCert = async (apiObj) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  // get k8s cluster domain
  const clusterDomain = process.env.CLUSTER_DOMAIN || 'cluster.local';
  // wait for certs
  const certs = await execShellCommand(
    `./tools/cert-generate.sh --name ${name} --namespace ${namespace} --domain ${clusterDomain}`
  );
  log(certs);
  // return CA, server cert and private key
  return {
    'cert.pem': fs.readFileSync(`./cert/${name}/cert.pem`),
    'key.pem': fs.readFileSync(`./cert/${name}/key.pem`),
    'cacert.pem': fs.readFileSync(`./cert/${name}/cacert.pem`)
  };
};
