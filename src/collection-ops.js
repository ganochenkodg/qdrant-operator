import { log } from './index.js';

const getConnectionParameters = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const clusterName = apiObj.spec.cluster;
  var parameters = {};
  const resCluster = await k8sCustomApi.getNamespacedCustomObjectStatus(
    'qdrant.operator',
    'v1alpha1',
    namespace,
    'qdrantclusters',
    clusterName
  );
  const resCurrent = resCluster.body;
  if (typeof resCurrent.spec.tls == 'undefined') {
    parameters.url = 'http://';
  } else {
    parameters.url = resCurrent.spec.tls.enabled ? 'https://' : 'http://';
  }
  parameters.url += `${clusterName}.${namespace}:6333/collections/${name}`;
  parameters.headers = { 'Content-Type': 'application/json' };

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

export const createCollection = async (apiObj, k8sCustomApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const parameters = await getConnectionParameters(
    apiObj,
    k8sCustomApi,
    k8sCoreApi
  );
  const body = {
    vectors: {
      size: apiObj.spec.vectorSize,
      distance: 'Cosine',
      on_disk: apiObj.spec.onDisk
    },
    shard_number: apiObj.spec.shardNumber,
    replication_factor: apiObj.spec.replicationFactor
  };
  try {
    log(
      `Trying to create a Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
    );
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
  const body = {
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
  try {
    log(
      `Trying to update a Collection "${name}" in the Cluster "${apiObj.spec.cluster}"...`
    );
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
