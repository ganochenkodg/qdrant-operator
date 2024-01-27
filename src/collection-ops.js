import { log } from './index.js';
import { genericTemplate } from './cluster-template.js';

// prepare connection params
const getConnectionParameters = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const clusterName = apiObj.spec.cluster;
  var parameters = {};
  // read the cluster custom object
  const resCluster = await k8sCustomApi.getNamespacedCustomObjectStatus(
    'qdrant.operator',
    'v1alpha1',
    namespace,
    'qdrantclusters',
    clusterName
  );
  const resCurrent = resCluster.body;
  // set http or https connection scheme
  if (typeof resCurrent.spec.tls == 'undefined') {
    parameters.url = 'http://';
  } else {
    parameters.url = resCurrent.spec.tls.enabled ? 'https://' : 'http://';
  }
  parameters.url += `${clusterName}.${namespace}:6333/collections/${name}`;
  parameters.headers = { 'Content-Type': 'application/json' };
  // set apikey header if required
  if (resCurrent.spec.apikey !== 'false') {
    const resSecret = await k8sCoreApi.readNamespacedSecret(
      `${clusterName}-apikey`,
      `${namespace}`
    );
    const resApikey = atob(resSecret.body.data['api-key']);
    parameters.headers['api-key'] = resApikey;
  }
  return parameters;
};

// prepare connection params
const getJobParameters = async (apiObj, k8sCustomApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const clusterName = apiObj.spec.cluster;
  var parameters = {};
  // read the cluster custom object
  const resCluster = await k8sCustomApi.getNamespacedCustomObjectStatus(
    'qdrant.operator',
    'v1alpha1',
    namespace,
    'qdrantclusters',
    clusterName
  );
  const resCurrent = resCluster.body;
  // set http or https connection scheme
  if (typeof resCurrent.spec.tls == 'undefined') {
    parameters.connectionMethod = 'http';
  } else {
    parameters.connectionMethod = resCurrent.spec.tls.enabled
      ? 'https'
      : 'http';
  }
  parameters.apikeyEnabled = resCurrent.spec.apikey !== 'false';
  parameters.replicas = resCurrent.spec.replicas;
  parameters.jobImage = process.env.JOB_IMAGE;
  return parameters;
};

// apply snapshot jobs
export const applyJobs = async (apiObj, k8sCustomApi, k8sBatchApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  // spec.snapshots is undefined, return
  if (typeof apiObj.spec.snapshots == 'undefined') {
    return;
  }
  // get cluster params for the job
  const parameters = await getJobParameters(apiObj, k8sCustomApi);
  // set additional configs
  if (apiObj.spec.snapshots.backupNow) {
    try {
      log(
        `Running a backup job for Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
      );
      const newBackupJobTemplate = genericTemplate(
        {
          ...apiObj,
          ...parameters
        },
        'job-backup.jsr'
      );
      k8sBatchApi.createNamespacedJob(`${namespace}`, newBackupJobTemplate);
      log(
        `Backup Job "${newBackupJobTemplate.metadata.name}" was successfully started!`
      );
    } catch (err) {
      log(err);
    }
  }
  if (apiObj.spec.snapshots.restoreSnapshotName !== '') {
    try {
      log(
        `Running a restore job for Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
      );
      const newRestoreJobTemplate = genericTemplate(
        {
          ...apiObj,
          ...parameters
        },
        'job-restore.jsr'
      );
      k8sBatchApi.createNamespacedJob(`${namespace}`, newRestoreJobTemplate);
      log(
        `Restore Job "${newRestoreJobTemplate.metadata.name}" was successfully started!`
      );
    } catch (err) {
      log(err);
    }
  }
  if (apiObj.spec.snapshots.backupSchedule !== '') {
    const newBackupCronjobTemplate = genericTemplate(
      {
        ...apiObj,
        ...parameters
      },
      'cronjob-backup.jsr'
    );
    try {
      // read cronjob if exists
      const res = await k8sBatchApi.readNamespacedCronJob(
        `${name}-backup`,
        `${namespace}`
      );
      const cronjob = res.body;
      log(`CronJob "${name}-backup" already exists!`);
      // and replace it
      k8sBatchApi.replaceNamespacedCronJob(
        `${name}-backup`,
        `${namespace}`,
        newBackupCronjobTemplate
      );
      log(`CronJob "${name}-backup" was successfully updated!`);
      return;
    } catch (err) {
      log(`CronJob "${name}-backup" is not available. Creating...`);
    }
    try {
      // create new backup cronjob
      k8sBatchApi.createNamespacedCronJob(
        `${namespace}`,
        newBackupCronjobTemplate
      );
      log(`CronJob "${name}-backup" was successfully created!`);
    } catch (err) {
      log(err);
    }
  }
};

export const createCollection = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const parameters = await getConnectionParameters(
    apiObj,
    k8sCustomApi,
    k8sCoreApi
  );
  // prepare payload
  var body = {
    vectors: {
      size: apiObj.spec.vectorSize,
      distance: 'Cosine',
      on_disk: apiObj.spec.onDisk
    },
    shard_number: apiObj.spec.shardNumber,
    replication_factor: apiObj.spec.replicationFactor
  };
  // set additional configs if defined
  if (typeof apiObj.spec.config !== 'undefined') {
    body = { ...body, ...apiObj.spec.config };
  }
  try {
    log(
      `Trying to create a Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
    );
    // PUT request to Qdrant API
    const resp = await fetch(parameters.url, {
      method: 'PUT',
      headers: parameters.headers,
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    log(`Status: "${JSON.stringify(data.status)}", time: "${data.time}".`);
  } catch (err) {
    log(err);
  }
};

export const updateCollection = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const parameters = await getConnectionParameters(
    apiObj,
    k8sCustomApi,
    k8sCoreApi
  );
  // prepare payload
  var body = {
    vectors: {
      '': {
        size: apiObj.spec.vectorSize,
        distance: 'Cosine',
        on_disk: apiObj.spec.onDisk
      }
    },
    shard_number: apiObj.spec.shardNumber,
    replication_factor: apiObj.spec.replicationFactor
  };
  // set additional configs
  if (typeof apiObj.spec.config !== 'undefined') {
    body = { ...body, ...apiObj.spec.config };
  }
  try {
    log(
      `Trying to update a Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
    );
    // PATCH request to Qdrant API
    const resp = await fetch(parameters.url, {
      method: 'PATCH',
      headers: parameters.headers,
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    log(`Status: "${JSON.stringify(data.status)}", time: "${data.time}".`);
  } catch (err) {
    log(err);
  }
};

export const deleteCollection = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const parameters = await getConnectionParameters(
    apiObj,
    k8sCustomApi,
    k8sCoreApi
  );
  try {
    log(
      `Trying to delete a Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
    );
    // DELETE request to qdrant API
    const resp = await fetch(parameters.url, {
      method: 'DELETE',
      headers: parameters.headers
    });
    const data = await resp.json();
    log(`Status: "${JSON.stringify(data.status)}", time: "${data.time}".`);
  } catch (err) {
    log(err);
  }
};
