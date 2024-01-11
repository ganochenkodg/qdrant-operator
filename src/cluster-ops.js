import { log } from './index.js';
import {
  clusterTemplate,
  clusterConfigmapTemplate,
  clusterAuthSecretTemplate,
  clusterReadSecretTemplate,
  clusterSecretTemplate,
  clusterSecretCertTemplate,
  clusterServiceHeadlessTemplate,
  clusterServiceTemplate,
  clusterPdbTemplate
} from './cluster-template.js';
import { generateCert } from './certificate.js';
import { Str } from '@supercharge/strings';

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

export const applyAuthSecretCluster = async (
  apiObj,
  k8sCoreApi,
  apikey,
  readApikey
) => {
  if (apikey == 'false') {
    return;
  }

  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const newAuthSecretClusterTemplate = clusterAuthSecretTemplate(
    apiObj,
    apikey,
    readApikey
  );

  try {
    const res = await k8sCoreApi.readNamespacedSecret(
      `${name}-auth-config`,
      `${namespace}`
    );
    const secret = res.body;
    log(`Secret "${name}-auth-config" already exists!`);
    k8sCoreApi.replaceNamespacedSecret(
      `${name}-auth-config`,
      `${namespace}`,
      newAuthSecretClusterTemplate
    );
    log(`Secret "${name}-auth-config" was successfully updated!`);
    return;
  } catch (err) {
    log(`Secret "${name}-auth-config" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedSecret(
      `${namespace}`,
      newAuthSecretClusterTemplate
    );
    log(`Secret "${name}-auth-config" was successfully created!`);
  } catch (err) {
    log(err);
  }
};

export const applySecretCluster = async (apiObj, k8sCoreApi) => {
  if (apiObj.spec.apikey == 'false') {
    return 'false';
  }

  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const apikey =
    apiObj.spec.apikey == 'true' ? Str.random(32) : apiObj.spec.apikey;
  const newSecretClusterTemplate = clusterSecretTemplate(apiObj, apikey);

  try {
    const res = await k8sCoreApi.readNamespacedSecret(
      `${name}-apikey`,
      `${namespace}`
    );
    const secret = res.body;
    log(`Secret "${name}-apikey" already exists!`);
    if (['true', atob(secret.data['api-key'])].includes(apiObj.spec.apikey)) {
      return atob(secret.data['api-key']);
    }
    k8sCoreApi.replaceNamespacedSecret(
      `${name}-apikey`,
      `${namespace}`,
      newSecretClusterTemplate
    );
    log(`Secret "${name}-apikey" was successfully updated!`);
    return apikey;
  } catch (err) {
    log(`Secret "${name}-apikey" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedSecret(`${namespace}`, newSecretClusterTemplate);
    log(`Secret "${name}-apikey" was successfully created!`);
    return apikey;
  } catch (err) {
    log(err);
  }
};

export const applyReadSecretCluster = async (apiObj, k8sCoreApi) => {
  if (apiObj.spec.readApikey == 'false') {
    return 'false';
  }

  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const readApikey =
    apiObj.spec.apikey == 'true' ? Str.random(32) : apiObj.spec.readApikey;
  const newReadSecretClusterTemplate = clusterReadSecretTemplate(
    apiObj,
    readApikey
  );

  try {
    const res = await k8sCoreApi.readNamespacedSecret(
      `${name}-read-apikey`,
      `${namespace}`
    );
    const secret = res.body;
    log(`Secret "${name}-read-apikey" already exists!`);
    if (
      ['true', atob(secret.data['api-key'])].includes(apiObj.spec.readApikey)
    ) {
      return atob(secret.data['api-key']);
    }
    k8sCoreApi.replaceNamespacedSecret(
      `${name}-read-apikey`,
      `${namespace}`,
      newReadSecretClusterTemplate
    );
    log(`Secret "${name}-read-apikey" was successfully updated!`);
    return readApikey;
  } catch (err) {
    log(`Secret "${name}-read-apikey" is not available. Creating...`);
  }
  try {
    k8sCoreApi.createNamespacedSecret(
      `${namespace}`,
      newReadSecretClusterTemplate
    );
    log(`Secret "${name}-read-apikey" was successfully created!`);
    return readApikey;
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
      newPdbClusterTemplate
    );
    log(`PDB "${name}" was successfully created!`);
  } catch (err) {
    log(err);
  }
};
