import yaml from 'js-yaml';
import { Str } from '@supercharge/strings';

const setOwnerReference = (apiObj) => {
  var template = {
    apiVersion: `${apiObj.apiVersion}`,
    kind: `${apiObj.kind}`,
    name: `${apiObj.metadata.name}`,
    uid: `${apiObj.metadata.uid}`
  };
  return template;
};

export const clusterTemplate = (apiObj) => {
  var name = apiObj.metadata.name;

  var template = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: `${name}`,
      namespace: `${apiObj.metadata.namespace}`,
      labels: {
        clustername: `${name}`,
        component: 'qdrant'
      }
    },
    spec: {
      replicas: `${apiObj.spec.replicas}`
    }
  };
  /*
  var template = {
    apiVersion: 'v1',
    kind: 'Secret',
    type: `${typeof apiObj.type !== 'undefined' ? apiObj.type : 'Opaque'}`,
    metadata: {
      name: `${apiObj.metadata.name}`,
      namespace: `${apiObj.metadata.namespace}`
    },
    data: {}
  };
  template.data = apiObj.data;
  */

  return template;
};

export const clusterSecretTemplate = (apiObj) => {
  var name = apiObj.metadata.name;
  const apikey =
    apiObj.spec.apikey == true ? Str.random(32) : apiObj.spec.apikey;

  var template = {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name: `${name}-apikey`,
      namespace: `${apiObj.metadata.namespace}`
    },
    data: {
      'api-key': `${btoa(apikey)}`,
      'local.yaml': `${btoa('service:\n  api_key: ' + apikey)}`
    }
  };

  template.metadata.ownerReferences = [setOwnerReference(apiObj)];

  return template;
};

export const clusterConfigmapTemplate = (apiObj) => {
  var name = apiObj.metadata.name;
  var initcommand = '#!/bin/sh\nSET_INDEX=${HOSTNAME##*-}\n';
  initcommand += 'echo "Starting initializing for pod $SET_INDEX"\n';
  initcommand += 'if [ "$SET_INDEX" = "0" ]; then\n';
  initcommand +=
    '  exec ./entrypoint.sh --uri "http://' +
    name +
    '-0.qdrant-headless:6335"\nelse\n';
  initcommand +=
    '  exec ./entrypoint.sh --bootstrap "http://' +
    name +
    '-0.' +
    name +
    '-headless:6335" ';
  initcommand +=
    '--uri "http://' + name + '-$SET_INDEX.' + name + '-headless:6335"\nfi\n';

  var template = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `${name}`,
      namespace: `${apiObj.metadata.namespace}`
    },
    data: {
      'initialize.sh': `${initcommand}`,
      'production.yaml': `${
        typeof apiObj.spec.config !== 'undefined'
          ? yaml.dump(apiObj.spec.config)
          : ''
      }`
    }
  };

  template.metadata.ownerReferences = [setOwnerReference(apiObj)];

  return template;
};
