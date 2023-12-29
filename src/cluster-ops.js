import { log } from './index.js';
import {
  clusterTemplate,
  clusterConfigmapTemplate
} from './cluster-template.js';

export const applyCluster = async (apiObj, k8sCoreApi) => {
  var newClusterTemplate = clusterTemplate(apiObj);
  console.log(newClusterTemplate);
};

export const applyConfigmapCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;

  try {
    const res = await k8sCoreApi.readNamespacedConfigMap(
      `${name}`,
      `${namespace}`
    );
    const configmap = res.body;
    log(`ConfigMap ${name} already exists!`);
    return;
  } catch (err) {
    log(`Can't read ConfigMap ${name} state...`);
  }
  try {
    const newConfigmapClusterTemplate = clusterConfigmapTemplate(apiObj);
    console.log(newConfigmapClusterTemplate);
    k8sCoreApi.createNamespacedConfigMap(
      `${namespace}`,
      newConfigmapClusterTemplate
    );
    log(`ConfigMap ${name} was successfully created!`);
  } catch (err) {
    log(err);
  }
};
