import { log } from './index.js';
import {
  clusterTemplate,
  clusterConfigmapTemplate,
  clusterSecretTemplate
} from './cluster-template.js';

export const applyCluster = async (apiObj, k8sCoreApi) => {
  var newClusterTemplate = clusterTemplate(apiObj);
  console.log(newClusterTemplate);
};

export const applySecretCluster = async (apiObj, k8sCoreApi) => {
  if (
    typeof apiObj.spec.apikey == 'undefined' ||
    apiObj.spec.apikey == 'false'
  ) {
    return;
  }

  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const newSecretClusterTemplate = clusterSecretTemplate(apiObj);

  try {
    const res = await k8sCoreApi.readNamespacedSecret(
      `${name}-apikey`,
      `${namespace}`
    );
    const secret = res.body;
    log(`Secret ${name}-apikey already exists!`);
    if ([true, atob(secret.data['api-key'])].includes(apiObj.spec.apikey)) {
      return;
    }
    k8sCoreApi.replaceNamespacedSecret(
      `${name}-apikey`,
      `${namespace}`,
      newSecretClusterTemplate
    );
    log(`Secret ${name}-apikey was successfully updated!`);
    return;
  } catch (err) {
    log(`Secret ${name}-apikey is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedSecret(`${namespace}`, newSecretClusterTemplate);
    log(`Secret ${name}-apikey was successfully created!`);
  } catch (err) {
    log(err);
  }
};

export const applyConfigmapCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const newConfigmapClusterTemplate = clusterConfigmapTemplate(apiObj);

  try {
    const res = await k8sCoreApi.readNamespacedConfigMap(
      `${name}`,
      `${namespace}`
    );
    const configmap = res.body;
    log(`ConfigMap ${name} already exists! Trying to update...`);
    k8sCoreApi.replaceNamespacedConfigMap(
      `${name}`,
      `${namespace}`,
      newConfigmapClusterTemplate
    );
    log(`ConfigMap ${name} was successfully updated!`);
    return;
  } catch (err) {
    log(`ConfigMap ${name} is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedConfigMap(
      `${namespace}`,
      newConfigmapClusterTemplate
    );
    log(`ConfigMap ${name} was successfully created!`);
  } catch (err) {
    log(err);
  }
};
