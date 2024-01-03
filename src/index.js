import * as k8s from '@kubernetes/client-node';
import {
  applyCluster,
  applyConfigmapCluster,
  applySecretCluster,
  applyServiceHeadlessCluster,
  applyServiceCluster,
  applyPdbCluster
} from './cluster-ops.js';

const debugMode = process.env.DEBUG_MODE || 'false';
let applyingScheduled = false;
let settingStatus = '';
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);
const k8sPolicyApi = kc.makeApiClient(k8s.PolicyV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const watch = new k8s.Watch(kc);

const onEvent = async (phase, apiObj) => {
  if (settingStatus == apiObj.metadata.name) {
    return;
  }
  log(`Received event in phase ${phase}.`);
  if (['ADDED', 'MODIFIED'].includes(phase)) {
    try {
      scheduleApplying(apiObj);
    } catch (err) {
      log(err);
    }
  } else if (phase == 'DELETED') {
    log(`${apiObj.kind} "${apiObj.metadata.name}" was deleted!`);
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

const setStatus = async (apiObj, k8sCustomApi, status) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  settingStatus = name;
  const readObj = await k8sCustomApi.getNamespacedCustomObjectStatus(
    'qdrant.operator',
    'v1alpha1',
    namespace,
    'qdrantclusters',
    name
  );
  const resCurrent = readObj.body;
  const newStatus = {
    apiVersion: apiObj.apiVersion,
    kind: apiObj.kind,
    metadata: {
      name: apiObj.metadata.name,
      resourceVersion: resCurrent.metadata.resourceVersion
    },
    status: {
      qdrantStatus: status
    }
  };
  try {
    const res = await k8sCustomApi.replaceNamespacedCustomObjectStatus(
      'qdrant.operator',
      'v1alpha1',
      namespace,
      'qdrantclusters',
      name,
      newStatus
    );
    log(`The cluster "${name}" status now is ${status}.`);
  } catch (err) {
    log(err);
  }
  settingStatus = '';
};

const waitForClusterReadiness = (apiObj, k8sAppsApi, k8sCustomApi) => {
  let interval = setInterval(
    async function (apiObj, k8sAppsApi, k8sCustomApi) {
      const name = apiObj.metadata.name;
      const namespace = apiObj.metadata.namespace;
      try {
        const res = await k8sAppsApi.readNamespacedStatefulSet(
          `${name}`,
          `${namespace}`
        );
        const stset = res.body;
        if (
          stset.status.availableReplicas >= stset.spec.replicas &&
          stset.status.updatedReplicas >= stset.spec.replicas
        ) {
          log(`Cluster "${name}" is ready!`);
          await setStatus(apiObj, k8sCustomApi, 'Running');
          clearInterval(interval);
        } else {
          log(
            `Cluster "${name}" is not ready: ${stset.status.availableReplicas}/${stset.spec.replicas} are available.`
          );
        }
        return;
      } catch (err) {
        log(`Cluster "${name}" was terminated, stop watching.`);
        clearInterval(interval);
      }
    },
    5000,
    apiObj,
    k8sAppsApi,
    k8sCustomApi
  );
};

const scheduleApplying = (apiObj) => {
  if (!applyingScheduled) {
    setTimeout(applyNow, 1000, apiObj);
    applyingScheduled = true;
  }
};

const applyNow = async (apiObj) => {
  applyingScheduled = false;
  await setStatus(apiObj, k8sCustomApi, 'Pending');
  await applyConfigmapCluster(apiObj, k8sCoreApi);
  await applySecretCluster(apiObj, k8sCoreApi);
  await applyServiceHeadlessCluster(apiObj, k8sCoreApi);
  await applyServiceCluster(apiObj, k8sCoreApi);
  await applyPdbCluster(apiObj, k8sPolicyApi);
  await applyCluster(apiObj, k8sAppsApi, k8sCoreApi);
  waitForClusterReadiness(apiObj, k8sAppsApi, k8sCustomApi);

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
