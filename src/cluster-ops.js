import { log } from './index.js';
import {
  clusterTemplate,
  clusterConfigmapTemplate,
  clusterSecretTemplate,
  clusterSecretCertTemplate,
  clusterServiceHeadlessTemplate,
  clusterServiceTemplate,
  clusterPdbTemplate
} from './cluster-template.js';
import { generateCert } from './certificate.js';

export const applySecretCertCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  try {
    const res = await k8sCoreApi.readNamespacedSecret(
      `${name}-server-cert`,
      `${namespace}`
    );
    log(
      `Found generated CA and certificates in the Secret ${name}-server-cert.`
    );
    return;
  } catch (err) {
    log(`CA and certificates are not available. Creating...`);
  }
  try {
    const cert = await generateCert(apiObj);
    const newSecretCertClusterTemplate = clusterSecretCertTemplate(
      apiObj,
      cert
    );
    k8sCoreApi.createNamespacedSecret(
      `${namespace}`,
      newSecretCertClusterTemplate
    );
    log(
      `CA and certificates were successfully created and stored in the Secret "${name}-server-cert"!`
    );
  } catch (err) {
    log(err);
  }
};

export const applyCluster = async (apiObj, k8sAppsApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;

  if (typeof apiObj.spec.tls == 'undefined') {
    apiObj.spec.tls = { enabled: false };
  }
  if (
    apiObj.spec.tls.enabled &&
    typeof apiObj.spec.tls.secretName == 'undefined'
  ) {
    await applySecretCertCluster(apiObj, k8sCoreApi);
    apiObj.spec.tls.secretName = name + '-server-cert';
  }

  var newClusterTemplate = clusterTemplate(apiObj);
  try {
    const res = await k8sAppsApi.readNamespacedStatefulSet(
      `${name}`,
      `${namespace}`
    );
    const cluster = res.body;

    if (apiObj.spec.replicas < cluster.spec.replicas) {
      log(`Warning: downscaling the cluster may result in data loss!`);
    }

    log(`StatefulSet "${name}" already exists! Trying to update...`);
    k8sAppsApi.replaceNamespacedStatefulSet(
      `${name}`,
      `${namespace}`,
      newClusterTemplate
    );
    log(`StatefulSet "${name}" was successfully updated!`);
    return;
  } catch (err) {
    log(`StatefulSet "${name}" is not available. Creating...`);
  }
  try {
    k8sAppsApi.createNamespacedStatefulSet(`${namespace}`, newClusterTemplate);
    log(`StatefulSet "${name}" was successfully created!`);
  } catch (err) {
    log(err);
  }
};

export const applySecretCluster = async (apiObj, k8sCoreApi) => {
  if (apiObj.spec.apikey == 'false') {
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
    log(`Secret "${name}-apikey" already exists!`);
    if (['true', atob(secret.data['api-key'])].includes(apiObj.spec.apikey)) {
      return;
    }
    k8sCoreApi.replaceNamespacedSecret(
      `${name}-apikey`,
      `${namespace}`,
      newSecretClusterTemplate
    );
    log(`Secret "${name}-apikey" was successfully updated!`);
    return;
  } catch (err) {
    log(`Secret "${name}-apikey" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedSecret(`${namespace}`, newSecretClusterTemplate);
    log(`Secret "${name}-apikey" was successfully created!`);
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
    log(`ConfigMap "${name}" already exists! Trying to update...`);
    k8sCoreApi.replaceNamespacedConfigMap(
      `${name}`,
      `${namespace}`,
      newConfigmapClusterTemplate
    );
    log(`ConfigMap "${name}" was successfully updated!`);
    return;
  } catch (err) {
    log(`ConfigMap "${name}" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedConfigMap(
      `${namespace}`,
      newConfigmapClusterTemplate
    );
    log(`ConfigMap "${name}" was successfully created!`);
  } catch (err) {
    log(err);
  }
};

export const applyServiceHeadlessCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const newServiceHeadlessClusterTemplate =
    clusterServiceHeadlessTemplate(apiObj);

  try {
    const res = await k8sCoreApi.readNamespacedService(
      `${name}-headless`,
      `${namespace}`
    );
    log(`Service "${name}-headless" already exists! Trying to update...`);
    k8sCoreApi.replaceNamespacedService(
      `${name}-headless`,
      `${namespace}`,
      newServiceHeadlessClusterTemplate
    );
    log(`Service "${name}-headless" was successfully updated!`);
    return;
  } catch (err) {
    log(`Service "${name}-headless" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedService(
      `${namespace}`,
      newServiceHeadlessClusterTemplate
    );
    log(`Service "${name}-headless" was successfully created!`);
  } catch (err) {
    log(err);
  }
};

export const applyServiceCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const newServiceClusterTemplate = clusterServiceTemplate(apiObj);

  try {
    const res = await k8sCoreApi.readNamespacedService(
      `${name}`,
      `${namespace}`
    );
    log(`Service "${name}" already exists! Trying to update...`);
    k8sCoreApi.replaceNamespacedService(
      `${name}`,
      `${namespace}`,
      newServiceClusterTemplate
    );
    log(`Service "${name}" was successfully updated!`);
    return;
  } catch (err) {
    log(`Service "${name}" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedService(
      `${namespace}`,
      newServiceClusterTemplate
    );
    log(`Service "${name}" was successfully created!`);
  } catch (err) {
    log(err);
  }
};

export const applyPdbCluster = async (apiObj, k8sPolicyApi) => {
  if (apiObj.spec.replicas == 1) {
    return;
  }

  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const newPdbClusterTemplate = clusterPdbTemplate(apiObj);

  try {
    const res = await k8sPolicyApi.readNamespacedPodDisruptionBudget(
      `${name}`,
      `${namespace}`
    );
    log(`PDB "${name}" already exists! Trying to update...`);
    k8sPolicyApi.replaceNamespacedPodDisruptionBudget(
      `${name}`,
      `${namespace}`,
      newPdbClusterTemplate
    );
    log(`PDB "${name}" was successfully updated!`);
    return;
  } catch (err) {
    log(`PDB "${name}" is not available. Creating...`);
  }
  try {
    k8sPolicyApi.createNamespacedPodDisruptionBudget(
      `${namespace}`,
      newPDBClusterTemplate
    );
    log(`PDB "${name}" was successfully created!`);
  } catch (err) {
    log(err);
  }
};
