import * as k8s from '@kubernetes/client-node';
import {
  setStatus,
  applyCluster,
  applyConfigmapCluster,
  applySecretCluster,
  applyServiceHeadlessCluster,
  applyServiceCluster
} from './cluster-ops.js';

const debugMode = process.env.DEBUG_MODE || 'false';
let applyingScheduled = false;

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);
const watch = new k8s.Watch(kc);

const onEvent = async (phase, apiObj) => {
  log(`Received event in phase ${phase}.`);
  if (['ADDED', 'MODIFIED'].includes(phase)) {
    try {
      scheduleApplying(apiObj);
    } catch (err) {
      log(err);
    }
  } else if (phase == 'DELETED') {
    // await deleteResource(obj, k8sCoreApi);
    console.log('Got delete event');
  } else {
    log(`Unknown event type: ${phase}`);
  }
};

const onDone = (err) => {
  log(`Connection closed. ${err}`);
  watchResource();
};

const watchResource = async () => {
  log('Watching API');
  let clusterWatch = watch.watch(
    '/apis/qdrant.operator/v1alpha1/qdrantclusters',
    {},
    onEvent,
    onDone
  );
  let collectionWatch = watch.watch(
    '/apis/qdrant.operator/v1alpha1/qdrantcollections',
    {},
    onEvent,
    onDone
  );
  return Promise.any([clusterWatch, collectionWatch]);
};

const scheduleApplying = (apiObj) => {
  if (!applyingScheduled) {
    setTimeout(applyNow, 1000, apiObj);
    applyingScheduled = true;
  }
};

const applyNow = async (apiObj) => {
  await setStatus(apiObj, k8sCustomApi, 'Pending');
  applyingScheduled = false;
  await applyConfigmapCluster(apiObj, k8sCoreApi);
  await applySecretCluster(apiObj, k8sCoreApi);
  await applyServiceHeadlessCluster(apiObj, k8sCoreApi);
  await applyServiceCluster(apiObj, k8sCoreApi);
  // await applyCluster(apiObj, k8sCoreApi);
};

const main = async () => {
  await watchResource();
};

export const log = (message) => {
  console.log(`${new Date().toLocaleString()}: ${message}`);
};

if (debugMode == 'true') {
  log('Debug mode ON!');
  process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  });
}

main();
