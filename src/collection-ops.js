import { log } from './index.js';

const getClusterParameters = async (apiObj, k8sCustomApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  var parameters = {};
  const res = await k8sCustomApi.getNamespacedCustomObjectStatus(
    'qdrant.operator',
    'v1alpha1',
    namespace,
    'qdrantclusters',
    name
  );
  const resCurrent = res.body;
  if (typeof resCurrent.spec.tls == 'undefined') {
    parameters.url = 'http://' + name + ':6333';
  } else {
    parameters.url =
      (resCurrent.spec.tls.enabled ? 'https://' : 'http://') + name + ':6333';
  }
};
