import http from 'node:http';
import { pathToFileURL } from 'node:url';
import * as k8s from '@kubernetes/client-node';
import { LeaseLeaderElection } from './leader-election.js';
import { log } from './logger.js';
import { CRD_GROUP, CRD_VERSION, isNotFound } from './k8s-utils.js';
import {
  applyCluster,
  applyConfigmapCluster,
  applyReadSecretCluster,
  applySecretCluster,
  applyAuthSecretCluster,
  applyServiceHeadlessCluster,
  applyServiceCluster,
  applyPdbCluster
} from './cluster-ops.js';
import {
  createCollection,
  updateCollection,
  deleteCollection,
  applyJobs
} from './collection-ops.js';

const resourceKey = (apiObj) =>
  `${apiObj.metadata.namespace}/${apiObj.metadata.name}`;

// per-resource state maps (keyed by "namespace/name")
const clusterTimers = new Map();
const readinessTimers = new Map();
const lastClusterGeneration = new Map();
const lastCollectionGeneration = new Map();
const retryTimers = new Map();

const MAX_BACKOFF_MS = 30000;

let k8sCoreApi;
let k8sCustomApi;
let k8sPolicyApi;
let k8sAppsApi;
let k8sBatchApi;
let k8sCoordinationApi;

const clearRetry = (retryKey) => {
  if (retryTimers.has(retryKey)) {
    clearTimeout(retryTimers.get(retryKey));
    retryTimers.delete(retryKey);
  }
};

const scheduleRetry = (retryKey, fn, delayMs = 5000) => {
  clearRetry(retryKey);
  const nextDelay = Math.min(delayMs * 2, MAX_BACKOFF_MS);
  log(`Scheduling retry for "${retryKey}" in ${delayMs}ms...`);
  const timer = setTimeout(() => {
    retryTimers.delete(retryKey);
    fn(nextDelay);
  }, delayMs);
  retryTimers.set(retryKey, timer);
};

// update QdrantCluster status subresource
const setStatus = async (apiObj, customApi, status) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  try {
    const resCurrent = await customApi.getNamespacedCustomObjectStatus({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: 'qdrantclusters',
      name
    });
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
    await customApi.replaceNamespacedCustomObjectStatus({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: 'qdrantclusters',
      name,
      body: newStatus
    });
    log(`Cluster "${name}" status is now ${status}.`);
  } catch (err) {
    if (!isNotFound(err)) {
      log(err);
    }
  }
};

// check the cluster readiness (one active interval per cluster)
const waitForClusterReadiness = (apiObj, appsApi, customApi) => {
  const key = resourceKey(apiObj);
  if (readinessTimers.has(key)) {
    clearInterval(readinessTimers.get(key));
  }

  const interval = setInterval(async () => {
    const name = apiObj.metadata.name;
    const namespace = apiObj.metadata.namespace;
    try {
      const stset = await appsApi.readNamespacedStatefulSet({
        name,
        namespace
      });
      const desired = stset.spec.replicas;
      const available = stset.status?.availableReplicas ?? 0;
      const updated = stset.status?.updatedReplicas ?? 0;
      const generationObserved =
        (stset.status?.observedGeneration ?? 0) >=
        (stset.metadata?.generation ?? 0);
      if (generationObserved && available >= desired && updated >= desired) {
        log(`Cluster "${name}" is ready.`);
        await setStatus(apiObj, customApi, 'Running');
        clearInterval(interval);
        readinessTimers.delete(key);
      } else {
        log(
          `Cluster "${name}" is not ready: ${available}/${desired} replicas available.`
        );
      }
    } catch (err) {
      if (isNotFound(err)) {
        log(`Cluster "${name}" was terminated; stopped watching.`);
        clearInterval(interval);
        readinessTimers.delete(key);
      } else {
        log(`Transient error checking readiness for "${name}": ${err}`);
      }
    }
  }, 5000);

  readinessTimers.set(key, interval);
};

// create or update all required k8s resources for a cluster
const applyNow = async (apiObj, retryDelayMs = 5000) => {
  const key = resourceKey(apiObj);
  const retryKey = `cluster:${key}`;
  clusterTimers.delete(key);
  clearRetry(retryKey);
  const versionToken =
    apiObj.metadata.generation ?? apiObj.metadata.resourceVersion;
  try {
    await setStatus(apiObj, k8sCustomApi, 'Pending');
    await applyConfigmapCluster(apiObj, k8sCoreApi);
    const readApikey = await applyReadSecretCluster(apiObj, k8sCoreApi);
    const apikey = await applySecretCluster(apiObj, k8sCoreApi);
    await applyAuthSecretCluster(apiObj, k8sCoreApi, apikey, readApikey);
    await applyServiceHeadlessCluster(apiObj, k8sCoreApi);
    await applyServiceCluster(apiObj, k8sCoreApi);
    await applyPdbCluster(apiObj, k8sPolicyApi);
    await applyCluster(apiObj, k8sAppsApi, k8sCoreApi);
    lastClusterGeneration.set(key, versionToken);
    waitForClusterReadiness(apiObj, k8sAppsApi, k8sCustomApi);
  } catch (err) {
    log(err);
    scheduleRetry(
      retryKey,
      (nextDelay) => applyNow(apiObj, nextDelay),
      retryDelayMs
    );
  }
};

// per-cluster debounce so rapid updates coalesce without dropping other clusters
export const scheduleApplying = (apiObj, applyFn = applyNow) => {
  const key = resourceKey(apiObj);
  if (clusterTimers.has(key)) {
    clearTimeout(clusterTimers.get(key));
  }
  const timer = setTimeout(() => {
    clusterTimers.delete(key);
    applyFn(apiObj);
  }, 1000);
  clusterTimers.set(key, timer);
};

// react on QdrantClusters events
const onEventCluster = async (phase, apiObj) => {
  const key = resourceKey(apiObj);

  if (phase === 'DELETED') {
    if (clusterTimers.has(key)) {
      clearTimeout(clusterTimers.get(key));
      clusterTimers.delete(key);
    }
    if (readinessTimers.has(key)) {
      clearInterval(readinessTimers.get(key));
      readinessTimers.delete(key);
    }
    clearRetry(`cluster:${key}`);
    lastClusterGeneration.delete(key);
    log(`${apiObj.kind} "${apiObj.metadata.name}" was deleted.`);
    return;
  }

  // status subresource updates do not increment metadata.generation
  const versionToken =
    apiObj.metadata.generation ?? apiObj.metadata.resourceVersion;
  if (lastClusterGeneration.get(key) === versionToken) {
    return;
  }
  log(`Received ${phase} event for cluster "${key}".`);

  if (['ADDED', 'MODIFIED'].includes(phase)) {
    scheduleApplying(apiObj);
  }
};

// react on QdrantCollections events
const onEventCollection = async (phase, apiObj, retryDelayMs = 5000) => {
  const key = resourceKey(apiObj);
  const retryKey = `collection:${key}`;

  if (phase === 'DELETED') {
    clearRetry(retryKey);
    lastCollectionGeneration.delete(key);
    log(`Received ${phase} event for collection "${key}".`);
    try {
      await deleteCollection(apiObj, k8sCustomApi, k8sCoreApi);
    } catch (err) {
      log(err);
    }
    return;
  }

  // status subresource updates do not increment metadata.generation
  const versionToken =
    apiObj.metadata.generation ?? apiObj.metadata.resourceVersion;
  if (lastCollectionGeneration.get(key) === versionToken) {
    return;
  }
  clearRetry(retryKey);

  // Skip recreating already-reconciled Ready collections after operator restart/failover
  const alreadyReady =
    phase === 'ADDED' &&
    apiObj.status?.collectionStatus === 'Ready' &&
    apiObj.status?.observedGeneration === apiObj.metadata.generation;

  log(`Received ${phase} event for collection "${key}".`);
  try {
    let outcome = 'ok';
    if (!alreadyReady) {
      outcome =
        phase === 'ADDED'
          ? await createCollection(apiObj, k8sCustomApi, k8sCoreApi)
          : await updateCollection(apiObj, k8sCustomApi, k8sCoreApi);
    }
    if (outcome === 'ok') {
      await applyJobs(apiObj, k8sCustomApi, k8sBatchApi);
      lastCollectionGeneration.set(key, versionToken);
    } else if (outcome === 'permanent') {
      lastCollectionGeneration.set(key, versionToken);
    } else {
      scheduleRetry(
        retryKey,
        (nextDelay) => onEventCollection(phase, apiObj, nextDelay),
        retryDelayMs
      );
    }
  } catch (err) {
    log(err);
    scheduleRetry(
      retryKey,
      (nextDelay) => onEventCollection(phase, apiObj, nextDelay),
      retryDelayMs
    );
  }
};

// create a resilient Kubernetes Informer with automatic list/watch resync and backoff
const startInformer = (kc, plural, label, handler) => {
  const path = `/apis/${CRD_GROUP}/${CRD_VERSION}/${plural}`;
  const listFn = () =>
    k8sCustomApi.listCustomObjectForAllNamespaces({
      group: CRD_GROUP,
      version: CRD_VERSION,
      resourcePlural: plural
    });

  const informer = k8s.makeInformer(kc, path, listFn);
  let backoffMs = 1000;
  let stopped = false;

  informer.on('connect', () => {
    backoffMs = 1000;
    log(`Watching ${label} API.`);
  });
  informer.on('add', (obj) => {
    backoffMs = 1000;
    handler('ADDED', obj);
  });
  informer.on('update', (obj) => {
    backoffMs = 1000;
    handler('MODIFIED', obj);
  });
  informer.on('delete', (obj) => {
    backoffMs = 1000;
    handler('DELETED', obj);
  });
  informer.on('error', (err) => {
    if (stopped) {
      return;
    }
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    log(`${label} informer error: ${err}. Restarting in ${delay}ms...`);
    setTimeout(() => {
      if (!stopped) {
        informer.start().catch((startErr) => log(startErr));
      }
    }, delay);
  });

  informer
    .start()
    .catch((err) => log(`Failed to start ${label} informer: ${err}`));

  return {
    stop: async () => {
      stopped = true;
      await informer.stop();
    }
  };
};

const main = async () => {
  const debugMode = process.env.DEBUG_MODE || 'false';
  if (debugMode === 'true') {
    log('Debug mode enabled.');
    process.on('unhandledRejection', (reason, p) => {
      console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    });
  }

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
  k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);
  k8sPolicyApi = kc.makeApiClient(k8s.PolicyV1Api);
  k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
  k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
  k8sCoordinationApi = kc.makeApiClient(k8s.CoordinationV1Api);

  const leaderElection = new LeaseLeaderElection(k8sCoordinationApi, {
    leaseName: 'qdrant-operator',
    namespace: process.env.POD_NAMESPACE,
    identity: process.env.POD_NAME,
    leaseDurationSeconds: 15,
    renewIntervalMs: 5000,
    retryIntervalMs: 5000
  });

  const healthPort = Number(process.env.HEALTH_PORT || 8080);
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/readyz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  healthServer.listen(healthPort, () => {
    log(`Health server listening on :${healthPort}`);
  });

  const informers = [];
  process.on('SIGTERM', async () => {
    leaderElection.stop();
    await Promise.allSettled(informers.map((inf) => inf.stop()));
    healthServer.close();
    log('Stopping gracefully...');
    process.exit(0);
  });

  log(`Pod "${process.env.POD_NAME}" is FOLLOWER. Acquiring leader status...`);
  await leaderElection.start();
  log(`Pod "${process.env.POD_NAME}" is LEADER.`);
  informers.push(
    startInformer(kc, 'qdrantclusters', 'QdrantClusters', onEventCluster),
    startInformer(
      kc,
      'qdrantcollections',
      'QdrantCollections',
      onEventCollection
    )
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    log(err);
    process.exit(1);
  });
}
