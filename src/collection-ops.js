import http from 'node:http';
import https from 'node:https';
import { log } from './logger.js';
import {
  CRD_GROUP,
  CRD_VERSION,
  fromBase64,
  isConflict,
  isNotFound,
  upsertResource
} from './k8s-utils.js';
import { genericTemplate } from './cluster-template.js';

const REQUEST_TIMEOUT_MS = 30000;

// HTTP/HTTPS request helper supporting per-cluster CA certificates and request timeout
export const qdrantRequest = (urlString, { method, headers, body, ca }) =>
  new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      url,
      { method, headers, timeout: REQUEST_TIMEOUT_MS, ...(ca ? { ca } : {}) },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(
        new Error(`Qdrant request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      );
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });

const readParentCluster = (apiObj, k8sCustomApi) =>
  k8sCustomApi.getNamespacedCustomObjectStatus({
    group: CRD_GROUP,
    version: CRD_VERSION,
    namespace: apiObj.metadata.namespace,
    plural: 'qdrantclusters',
    name: apiObj.spec.cluster
  });

const patchCollectionStatus = async (apiObj, k8sCustomApi, statusPatch) => {
  if (!k8sCustomApi.replaceNamespacedCustomObjectStatus) {
    return;
  }
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  try {
    const current = await k8sCustomApi.getNamespacedCustomObjectStatus({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: 'qdrantcollections',
      name
    });
    const mergedStatus = {
      ...(current.status || {}),
      ...statusPatch
    };
    await k8sCustomApi.replaceNamespacedCustomObjectStatus({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: 'qdrantcollections',
      name,
      body: {
        apiVersion: apiObj.apiVersion,
        kind: apiObj.kind,
        metadata: {
          name,
          resourceVersion: current.metadata.resourceVersion
        },
        status: mergedStatus
      }
    });
    apiObj.status = mergedStatus;
  } catch (err) {
    if (!isNotFound(err)) {
      log(`Failed to update status for collection "${name}": ${err}`);
    }
  }
};

// prepare Qdrant HTTP connection parameters for a collection
const getConnectionParameters = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const clusterName = apiObj.spec.cluster;
  const resCurrent = await readParentCluster(apiObj, k8sCustomApi);
  const tlsEnabled = Boolean(resCurrent.spec.tls?.enabled);
  const clusterDomain = process.env.CLUSTER_DOMAIN || 'cluster.local';

  const parameters = {
    url: `${tlsEnabled ? 'https' : 'http'}://${clusterName}.${namespace}.svc.${clusterDomain}:6333/collections/${name}`,
    headers: { 'Content-Type': 'application/json' }
  };

  if (tlsEnabled) {
    const certSecretName =
      resCurrent.spec.tls.secretName || `${clusterName}-server-cert`;
    const certSecret = await k8sCoreApi.readNamespacedSecret({
      name: certSecretName,
      namespace
    });
    if (certSecret.data?.['cacert.pem']) {
      parameters.ca = fromBase64(certSecret.data['cacert.pem']);
    }
  }

  if (resCurrent.spec.apikey !== 'false') {
    const resSecret = await k8sCoreApi.readNamespacedSecret({
      name: `${clusterName}-apikey`,
      namespace
    });
    parameters.headers['api-key'] = fromBase64(resSecret.data['api-key']);
  }
  return parameters;
};

// prepare job template parameters from parent cluster
const getJobParameters = async (apiObj, k8sCustomApi) => {
  if (!process.env.JOB_IMAGE) {
    throw new Error('JOB_IMAGE environment variable is not set');
  }
  const clusterName = apiObj.spec.cluster;
  const resCurrent = await readParentCluster(apiObj, k8sCustomApi);
  const tlsEnabled = Boolean(resCurrent.spec.tls?.enabled);
  return {
    tlsEnabled,
    tlsSecretName:
      resCurrent.spec.tls?.secretName || `${clusterName}-server-cert`,
    connectionMethod: tlsEnabled ? 'https' : 'http',
    apikeyEnabled: resCurrent.spec.apikey !== 'false',
    replicas: resCurrent.spec.replicas,
    clusterDomain: process.env.CLUSTER_DOMAIN || 'cluster.local',
    jobImage: process.env.JOB_IMAGE
  };
};

// ensure declared payload indexes (supports keyword, text/BM25, nested fields)
const applyPayloadIndexes = async (apiObj, parameters, requestFn) => {
  const indexes = apiObj.spec.payloadIndexes;
  if (!indexes?.length) {
    return;
  }
  for (const idx of indexes) {
    const resp = await requestFn(`${parameters.url}/index?wait=true`, {
      method: 'PUT',
      headers: parameters.headers,
      body: JSON.stringify({
        field_name: idx.fieldName,
        field_schema: idx.fieldSchema
      }),
      ca: parameters.ca
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to create payload index "${idx.fieldName}" (HTTP ${resp.status}): ${JSON.stringify(resp.data)}`
      );
    }
    log(
      `Ensured payload index "${idx.fieldName}" on collection "${apiObj.metadata.name}".`
    );
  }
};

// apply snapshot jobs and cronjob (tracks lastBackupGeneration / lastRestoredSnapshot in status)
export const applyJobs = async (apiObj, k8sCustomApi, k8sBatchApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const snapshots = apiObj.spec.snapshots;
  if (typeof snapshots === 'undefined') {
    return;
  }

  const parameters = await getJobParameters(apiObj, k8sCustomApi);
  const generation = apiObj.metadata.generation;
  const currentStatus = apiObj.status || {};

  if (
    snapshots.backupNow &&
    (generation === undefined ||
      currentStatus.lastBackupGeneration !== generation)
  ) {
    log(
      `Starting backup job for collection "${name}" in cluster "${apiObj.spec.cluster}"...`
    );
    const body = genericTemplate(
      { ...apiObj, ...parameters },
      'job-backup.eta'
    );
    try {
      await k8sBatchApi.createNamespacedJob({ namespace, body });
      log(`Backup Job "${body.metadata.name}" started.`);
    } catch (err) {
      if (!isConflict(err)) {
        throw err;
      }
    }
    if (generation !== undefined) {
      await patchCollectionStatus(apiObj, k8sCustomApi, {
        lastBackupGeneration: generation
      });
    }
  }

  if (
    snapshots.restoreSnapshotName &&
    currentStatus.lastRestoredSnapshot !== snapshots.restoreSnapshotName
  ) {
    log(
      `Starting restore job for collection "${name}" in cluster "${apiObj.spec.cluster}"...`
    );
    const body = genericTemplate(
      { ...apiObj, ...parameters },
      'job-restore.eta'
    );
    try {
      await k8sBatchApi.createNamespacedJob({ namespace, body });
      log(`Restore Job "${body.metadata.name}" started.`);
    } catch (err) {
      if (!isConflict(err)) {
        throw err;
      }
    }
    await patchCollectionStatus(apiObj, k8sCustomApi, {
      lastRestoredSnapshot: snapshots.restoreSnapshotName
    });
  }

  const cronJobName = `${name}-backup`;
  if (!snapshots.backupSchedule) {
    try {
      await k8sBatchApi.deleteNamespacedCronJob({
        name: cronJobName,
        namespace
      });
      log(`CronJob "${cronJobName}" deleted (backup schedule cleared).`);
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
    return;
  }

  const body = genericTemplate(
    { ...apiObj, ...parameters },
    'cronjob-backup.eta'
  );
  await upsertResource({
    label: `CronJob "${cronJobName}"`,
    read: () =>
      k8sBatchApi.readNamespacedCronJob({ name: cronJobName, namespace }),
    update: () =>
      k8sBatchApi.replaceNamespacedCronJob({
        name: cronJobName,
        namespace,
        body
      }),
    create: () => k8sBatchApi.createNamespacedCronJob({ namespace, body })
  });
};

// Shared create/update execution path for Qdrant collections
const reconcileCollection = async (
  apiObj,
  k8sCustomApi,
  k8sCoreApi,
  requestFn,
  { action, method, buildBody, onConflict }
) => {
  const name = apiObj.metadata.name;
  const spec = apiObj.spec;
  const observedGeneration =
    apiObj.metadata.generation !== undefined
      ? { observedGeneration: apiObj.metadata.generation }
      : {};
  try {
    const parameters = await getConnectionParameters(
      apiObj,
      k8sCustomApi,
      k8sCoreApi
    );
    const body = buildBody(spec);
    log(`${action} collection "${name}" in cluster "${spec.cluster}"...`);
    const resp = await requestFn(parameters.url, {
      method,
      headers: parameters.headers,
      body: JSON.stringify(body),
      ca: parameters.ca
    });
    if (resp.status === 409 && onConflict) {
      log(`Collection "${name}" already exists; switching to update.`);
      return onConflict();
    }
    if (!resp.ok) {
      const msg = `HTTP ${resp.status}: ${JSON.stringify(resp.data)}`;
      log(`Failed to ${action.toLowerCase()} collection "${name}" (${msg}).`);
      await patchCollectionStatus(apiObj, k8sCustomApi, {
        collectionStatus: 'Error',
        message: msg,
        ...observedGeneration
      });
      const retryable =
        resp.status >= 500 || resp.status === 408 || resp.status === 429;
      return retryable ? 'retry' : 'permanent';
    }
    log(
      `Qdrant response: status=${JSON.stringify(resp.data.status)}, time=${resp.data.time}s.`
    );
    await applyPayloadIndexes(apiObj, parameters, requestFn);
    await patchCollectionStatus(apiObj, k8sCustomApi, {
      collectionStatus: 'Ready',
      message: 'ok',
      ...observedGeneration
    });
    return 'ok';
  } catch (err) {
    log(err);
    await patchCollectionStatus(apiObj, k8sCustomApi, {
      collectionStatus: 'Error',
      message: String(err),
      ...observedGeneration
    });
    throw err;
  }
};

export const createCollection = (
  apiObj,
  k8sCustomApi,
  k8sCoreApi,
  requestFn = qdrantRequest
) =>
  reconcileCollection(apiObj, k8sCustomApi, k8sCoreApi, requestFn, {
    action: 'Creating',
    method: 'PUT',
    onConflict: () =>
      updateCollection(apiObj, k8sCustomApi, k8sCoreApi, requestFn),
    buildBody: (spec) => {
      let body = {
        shard_number: spec.shardNumber,
        replication_factor: spec.replicationFactor
      };
      if (spec.vectors) {
        body.vectors = spec.vectors;
      } else if (spec.vectorSize) {
        body.vectors = {
          size: spec.vectorSize,
          distance: spec.distance || 'Cosine',
          on_disk: spec.onDisk,
          ...(spec.datatype ? { datatype: spec.datatype } : {})
        };
      }
      if (spec.sparseVectors) {
        body.sparse_vectors = spec.sparseVectors;
      }
      if (typeof spec.config !== 'undefined') {
        body = { ...body, ...spec.config };
      }
      return body;
    }
  });

export const updateCollection = (
  apiObj,
  k8sCustomApi,
  k8sCoreApi,
  requestFn = qdrantRequest
) =>
  reconcileCollection(apiObj, k8sCustomApi, k8sCoreApi, requestFn, {
    action: 'Updating',
    method: 'PATCH',
    buildBody: (spec) => {
      // Qdrant PATCH only accepts mutable fields (not vector size/distance or shard_number)
      const body = {
        ...(spec.config || {}),
        params: {
          replication_factor: spec.replicationFactor,
          ...(spec.config?.params || {})
        }
      };
      if (!spec.vectors && spec.vectorSize && !body.vectors) {
        body.vectors = {
          '': {
            on_disk: spec.onDisk
          }
        };
      }
      return body;
    }
  });

export const deleteCollection = async (
  apiObj,
  k8sCustomApi,
  k8sCoreApi,
  requestFn = qdrantRequest
) => {
  const name = apiObj.metadata.name;
  try {
    const parameters = await getConnectionParameters(
      apiObj,
      k8sCustomApi,
      k8sCoreApi
    );
    log(`Deleting collection "${name}" in cluster "${apiObj.spec.cluster}"...`);
    const resp = await requestFn(parameters.url, {
      method: 'DELETE',
      headers: parameters.headers,
      ca: parameters.ca
    });
    if (!resp.ok) {
      log(
        `Failed to delete collection "${name}" (HTTP ${resp.status}): ${JSON.stringify(resp.data)}`
      );
      return;
    }
    log(
      `Qdrant response: status=${JSON.stringify(resp.data.status)}, time=${resp.data.time}s.`
    );
  } catch (err) {
    if (isNotFound(err)) {
      log(
        `Cluster "${apiObj.spec.cluster}" no longer exists; skipping deletion of collection "${name}".`
      );
      return;
    }
    log(err);
  }
};
