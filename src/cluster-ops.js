import { randomBytes } from 'node:crypto';
import * as k8s from '@kubernetes/client-node';
import { log } from './logger.js';
import { fromBase64, isNotFound, upsertResource } from './k8s-utils.js';
import {
  clusterTemplate,
  clusterConfigmapTemplate,
  clusterAuthSecretTemplate,
  clusterReadSecretTemplate,
  clusterSecretTemplate,
  clusterSecretCertTemplate,
  genericTemplate
} from './cluster-template.js';
import { generateCert } from './certificate.js';

const generateApiKey = () => randomBytes(24).toString('base64url');
const strategicMergePatchOptions = k8s.setHeaderOptions(
  'Content-Type',
  k8s.PatchStrategy.StrategicMergePatch
);

// Shared helper for read-write and read-only API key secrets
const applyApiKeySecret = async (
  apiObj,
  k8sCoreApi,
  { specKey, suffix, buildTemplate }
) => {
  const specValue = apiObj.spec[specKey];
  if (specValue === 'false') {
    return 'false';
  }

  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const secretName = `${name}${suffix}`;
  const key = specValue === 'true' ? generateApiKey() : specValue;
  const body = buildTemplate(apiObj, key);

  let existingSecret;
  try {
    existingSecret = await k8sCoreApi.readNamespacedSecret({
      name: secretName,
      namespace
    });
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  if (existingSecret) {
    log(`Secret "${secretName}" already exists.`);
    const currentKey = fromBase64(existingSecret.data['api-key']);
    if (['true', currentKey].includes(specValue)) {
      return currentKey;
    }
    await k8sCoreApi.replaceNamespacedSecret({
      name: secretName,
      namespace,
      body
    });
    log(`Secret "${secretName}" updated successfully.`);
    return key;
  }

  log(`Secret "${secretName}" not found. Creating...`);
  await k8sCoreApi.createNamespacedSecret({ namespace, body });
  log(`Secret "${secretName}" created successfully.`);
  return key;
};

const applyService = async (
  apiObj,
  k8sCoreApi,
  { serviceName, templateName }
) => {
  const namespace = apiObj.metadata.namespace;
  const body = genericTemplate(apiObj, templateName);
  await upsertResource({
    label: `Service "${serviceName}"`,
    read: () =>
      k8sCoreApi.readNamespacedService({ name: serviceName, namespace }),
    update: () =>
      k8sCoreApi.patchNamespacedService(
        { name: serviceName, namespace, body },
        strategicMergePatchOptions
      ),
    create: () => k8sCoreApi.createNamespacedService({ namespace, body })
  });
};

// create a secret with TLS certificates
export const applySecretCertCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const secretName = `${name}-server-cert`;
  try {
    await k8sCoreApi.readNamespacedSecret({ name: secretName, namespace });
    log(`Found existing TLS certificates in Secret "${secretName}".`);
    return;
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
    log(`TLS certificates not found. Generating...`);
  }
  const cert = await generateCert(apiObj);
  await k8sCoreApi.createNamespacedSecret({
    namespace,
    body: clusterSecretCertTemplate(apiObj, cert)
  });
  log(`TLS certificates generated and stored in Secret "${secretName}".`);
};

// create or update statefulset
export const applyCluster = async (apiObj, k8sAppsApi, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  let effectiveApiObj = apiObj;

  if (apiObj.spec.tls?.enabled && !apiObj.spec.tls.secretName) {
    await applySecretCertCluster(apiObj, k8sCoreApi);
    effectiveApiObj = {
      ...apiObj,
      spec: {
        ...apiObj.spec,
        tls: { ...apiObj.spec.tls, secretName: `${name}-server-cert` }
      }
    };
  }

  const newClusterTemplate = clusterTemplate(effectiveApiObj);
  let existingCluster;
  try {
    existingCluster = await k8sAppsApi.readNamespacedStatefulSet({
      name,
      namespace
    });
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  if (existingCluster) {
    if (effectiveApiObj.spec.replicas < existingCluster.spec.replicas) {
      log(`Warning: downscaling the cluster may result in data loss.`);
    }
    log(`StatefulSet "${name}" already exists. Updating...`);
    // Full replace removes deleted sidecars/env/probes/volumes while preserving immutable StatefulSet fields
    const replaceBody = {
      ...newClusterTemplate,
      metadata: {
        ...newClusterTemplate.metadata,
        resourceVersion: existingCluster.metadata?.resourceVersion
      },
      spec: {
        ...newClusterTemplate.spec,
        selector: existingCluster.spec.selector,
        serviceName: existingCluster.spec.serviceName,
        ...(existingCluster.spec.podManagementPolicy
          ? { podManagementPolicy: existingCluster.spec.podManagementPolicy }
          : {}),
        ...(existingCluster.spec.volumeClaimTemplates
          ? { volumeClaimTemplates: existingCluster.spec.volumeClaimTemplates }
          : {})
      }
    };
    await k8sAppsApi.replaceNamespacedStatefulSet({
      name,
      namespace,
      body: replaceBody
    });
    log(`StatefulSet "${name}" updated successfully.`);
    return;
  }

  log(`StatefulSet "${name}" not found. Creating...`);
  await k8sAppsApi.createNamespacedStatefulSet({
    namespace,
    body: newClusterTemplate
  });
  log(`StatefulSet "${name}" created successfully.`);
};

// create or update authentication config secret
export const applyAuthSecretCluster = async (
  apiObj,
  k8sCoreApi,
  apikey,
  readApikey
) => {
  if (!apikey || apikey === 'false') {
    return;
  }
  const secretName = `${apiObj.metadata.name}-auth-config`;
  const namespace = apiObj.metadata.namespace;
  const body = clusterAuthSecretTemplate(apiObj, apikey, readApikey);
  await upsertResource({
    label: `Secret "${secretName}"`,
    read: () =>
      k8sCoreApi.readNamespacedSecret({ name: secretName, namespace }),
    update: () =>
      k8sCoreApi.replaceNamespacedSecret({ name: secretName, namespace, body }),
    create: () => k8sCoreApi.createNamespacedSecret({ namespace, body })
  });
};

// create or update read-write apikey secret
export const applySecretCluster = (apiObj, k8sCoreApi) =>
  applyApiKeySecret(apiObj, k8sCoreApi, {
    specKey: 'apikey',
    suffix: '-apikey',
    buildTemplate: clusterSecretTemplate
  });

// create or update read-only apikey secret
export const applyReadSecretCluster = (apiObj, k8sCoreApi) =>
  applyApiKeySecret(apiObj, k8sCoreApi, {
    specKey: 'readApikey',
    suffix: '-read-apikey',
    buildTemplate: clusterReadSecretTemplate
  });

// create or update configmap with custom cluster config
export const applyConfigmapCluster = async (apiObj, k8sCoreApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const body = clusterConfigmapTemplate(apiObj);
  await upsertResource({
    label: `ConfigMap "${name}"`,
    read: () => k8sCoreApi.readNamespacedConfigMap({ name, namespace }),
    update: () =>
      k8sCoreApi.replaceNamespacedConfigMap({ name, namespace, body }),
    create: () => k8sCoreApi.createNamespacedConfigMap({ namespace, body })
  });
};

// create or update headless service for peer-to-peer communication
export const applyServiceHeadlessCluster = (apiObj, k8sCoreApi) =>
  applyService(apiObj, k8sCoreApi, {
    serviceName: `${apiObj.metadata.name}-headless`,
    templateName: 'service-headless.eta'
  });

// create or update client service
export const applyServiceCluster = (apiObj, k8sCoreApi) =>
  applyService(apiObj, k8sCoreApi, {
    serviceName: apiObj.metadata.name,
    templateName: 'service.eta'
  });

// create or delete PDB depending on replica count
export const applyPdbCluster = async (apiObj, k8sPolicyApi) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;

  if (apiObj.spec.replicas <= 1) {
    try {
      await k8sPolicyApi.deleteNamespacedPodDisruptionBudget({
        name,
        namespace
      });
      log(`PDB "${name}" deleted (single-replica cluster).`);
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
    }
    return;
  }

  try {
    await k8sPolicyApi.readNamespacedPodDisruptionBudget({ name, namespace });
    log(`PDB "${name}" already exists.`);
    return;
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
    log(`PDB "${name}" not found. Creating...`);
  }
  await k8sPolicyApi.createNamespacedPodDisruptionBudget({
    namespace,
    body: genericTemplate(apiObj, 'pdb.eta')
  });
  log(`PDB "${name}" created successfully.`);
};
